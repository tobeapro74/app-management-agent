"""
앱관리 에이전트 FastAPI 서버

엔드포인트:
  GET  /                        — 헬스체크
  POST /api/run                 — 전체 앱 점검 즉시 실행
  POST /api/recheck/{app_name}  — 단일 앱 재점검 (warm-up ping 포함, 즉시 결과 반환)
  GET  /api/status              — 모든 앱 최신 상태
  GET  /api/status/{app}        — 특정 앱 최신 상태
  GET  /api/history/{app}       — 특정 앱 점검 이력 (최근 30건)
  GET  /api/apps                — 모니터링 앱 목록
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

# 프로젝트 루트를 sys.path에 추가
_root = Path(__file__).parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

# .env 로드
_env = _root / ".env"
if _env.exists():
    import os
    for line in _env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from config import APPS
from checkers import dart_info, sajunow, yeouido, n2golf, generic
from checkers import dart_link as dart_link_checker
from reporters.report import build_report
from reporters.slack import send_slack
from checkers.base import CheckResult
from api.database import init_db, save_results, get_latest, get_history

CHECKER_MAP = {
    "Dart Link": dart_link_checker,
    "Dart Monitor": dart_info,
    "사주나우": sajunow,
    "여의도 한끼": yeouido,
    "N2골프": n2golf,
    "대만맛집": generic,
    "makedocu": generic,
    "HNW아카이브": generic,
}

app = FastAPI(title="앱관리 에이전트", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_running = False


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/")
def health():
    return {"status": "ok", "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


@app.get("/api/apps")
def list_apps():
    return [{"name": a.name, "base_url": a.base_url} for a in APPS]


@app.get("/api/status")
def status_all():
    rows = get_latest()
    if not rows:
        raise HTTPException(404, "아직 점검 이력이 없습니다. POST /api/run 으로 먼저 실행하세요.")
    return rows


@app.get("/api/status/{app_name}")
def status_one(app_name: str):
    rows = get_latest(app_name)
    if not rows:
        raise HTTPException(404, f"'{app_name}' 점검 이력 없음")
    return rows[0]


@app.get("/api/history/{app_name}")
def history(app_name: str, limit: int = 30):
    rows = get_history(app_name, limit)
    if not rows:
        raise HTTPException(404, f"'{app_name}' 점검 이력 없음")
    return rows


@app.post("/api/run")
async def run_now(background_tasks: BackgroundTasks, notify_slack: bool = False):
    global _running
    if _running:
        return {"status": "already_running", "message": "이미 점검이 실행 중입니다."}
    background_tasks.add_task(_run_checks, notify_slack)
    return {"status": "started", "message": "점검을 시작했습니다. /api/status 로 결과를 확인하세요."}


@app.post("/api/recheck/{app_name}")
async def recheck_one(app_name: str):
    """단일 앱 재점검. warm-up ping 3회 시도 후 최선 결과를 즉시 반환."""
    app_cfg = next((a for a in APPS if a.name == app_name), None)
    if not app_cfg:
        raise HTTPException(404, f"'{app_name}' 앱을 찾을 수 없습니다.")
    checker = CHECKER_MAP.get(app_name)
    if not checker:
        raise HTTPException(404, f"'{app_name}' 체커가 없습니다.")

    best: CheckResult | None = None
    attempts = []
    for i in range(3):
        try:
            result = await checker.check(app_cfg)
        except Exception as e:
            result = CheckResult(app_name=app_name, status="error")
            result.errors.append(str(e))
        attempts.append(result)
        # 정상이면 더 이상 재시도 불필요
        if result.status == "ok":
            best = result
            break
        if best is None or (result.response_ms or 9999) < (best.response_ms or 9999):
            best = result

    assert best is not None

    # 결과 DB 저장
    save_results([{
        "app_name": best.app_name,
        "status": best.status,
        "response_ms": best.response_ms,
        "details": best.details,
        "warnings": best.warnings,
        "errors": best.errors,
        "checked_at": best.checked_at,
    }])

    response_times = [r.response_ms for r in attempts if r.response_ms is not None]
    return {
        "app_name": best.app_name,
        "status": best.status,
        "response_ms": best.response_ms,
        "details": best.details,
        "warnings": best.warnings,
        "errors": best.errors,
        "checked_at": best.checked_at,
        "attempts": len(attempts),
        "response_times": response_times,
        "resolved": best.status == "ok",
    }


async def _run_checks(notify_slack: bool = False):
    global _running
    _running = True
    try:
        tasks = []
        apps_with_checker = []
        for app_cfg in APPS:
            checker = CHECKER_MAP.get(app_cfg.name)
            if checker:
                tasks.append(checker.check(app_cfg))
                apps_with_checker.append(app_cfg)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        final: list[CheckResult] = []
        for app_cfg, result in zip(apps_with_checker, results):
            if isinstance(result, Exception):
                r = CheckResult(app_name=app_cfg.name, status="error")
                r.errors.append(str(result))
                final.append(r)
            else:
                final.append(result)

        # DB 저장
        save_results([
            {
                "app_name": r.app_name,
                "status": r.status,
                "response_ms": r.response_ms,
                "details": r.details,
                "warnings": r.warnings,
                "errors": r.errors,
                "checked_at": r.checked_at,
            }
            for r in final
        ])

        if notify_slack:
            report = build_report(final)
            await send_slack(report)
    finally:
        _running = False
