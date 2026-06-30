import os
import sqlite3
import json
from pathlib import Path
from datetime import datetime

_default = Path(__file__).parent.parent / "data" / "history.db"
DB_PATH = Path(os.getenv("DB_PATH", str(_default)))


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS check_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_name TEXT NOT NULL,
                status TEXT NOT NULL,
                response_ms INTEGER,
                details TEXT,
                warnings TEXT,
                errors TEXT,
                checked_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_app_checked ON check_history(app_name, checked_at)")


def save_results(results: list[dict]):
    with get_conn() as conn:
        conn.executemany(
            """INSERT INTO check_history (app_name, status, response_ms, details, warnings, errors, checked_at)
               VALUES (:app_name, :status, :response_ms, :details, :warnings, :errors, :checked_at)""",
            [
                {
                    "app_name": r["app_name"],
                    "status": r["status"],
                    "response_ms": r.get("response_ms"),
                    "details": json.dumps(r.get("details", {}), ensure_ascii=False),
                    "warnings": json.dumps(r.get("warnings", []), ensure_ascii=False),
                    "errors": json.dumps(r.get("errors", []), ensure_ascii=False),
                    "checked_at": r.get("checked_at", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                }
                for r in results
            ],
        )


def get_latest(app_name: str | None = None) -> list[dict]:
    """각 앱의 가장 최근 체크 결과 1건씩 반환."""
    with get_conn() as conn:
        if app_name:
            rows = conn.execute(
                """SELECT * FROM check_history WHERE app_name = ?
                   ORDER BY checked_at DESC LIMIT 1""",
                (app_name,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT h.* FROM check_history h
                   INNER JOIN (
                       SELECT app_name, MAX(checked_at) AS max_at
                       FROM check_history GROUP BY app_name
                   ) latest ON h.app_name = latest.app_name AND h.checked_at = latest.max_at
                   ORDER BY h.app_name"""
            ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_history(app_name: str, limit: int = 30) -> list[dict]:
    """특정 앱의 최근 이력 반환."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM check_history WHERE app_name = ? ORDER BY checked_at DESC LIMIT ?",
            (app_name, limit),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_availability(days: int = 7) -> list[dict]:
    """최근 N일 앱별 가용성(ok 비율) + 평균 응답속도 반환."""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT
                app_name,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok_count,
                ROUND(AVG(CASE WHEN response_ms IS NOT NULL THEN response_ms END), 0) AS avg_ms
               FROM check_history
               WHERE checked_at >= datetime('now', ? || ' days')
               GROUP BY app_name""",
            (f"-{days}",),
        ).fetchall()
    return [
        {
            "app_name": r["app_name"],
            "total": r["total"],
            "ok_count": r["ok_count"],
            "availability": round(r["ok_count"] / r["total"] * 100, 1) if r["total"] else 0,
            "avg_ms": int(r["avg_ms"]) if r["avg_ms"] else None,
        }
        for r in rows
    ]


def _row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["details"] = json.loads(d["details"] or "{}")
    d["warnings"] = json.loads(d["warnings"] or "[]")
    d["errors"] = json.loads(d["errors"] or "[]")
    return d
