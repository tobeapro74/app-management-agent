"""
앱관리 에이전트 FastAPI 서버

엔드포인트:
  GET  /                        — 헬스체크
  POST /api/run                 — 전체 앱 점검 즉시 실행 (morning 모드)
  POST /api/run/evening         — Dart Link 데이터 수신 결과 체크 (evening 모드)
  POST /api/recheck/{app_name}  — 단일 앱 재점검 (warm-up ping 포함, 즉시 결과 반환)
  POST /api/trigger-fix          — CCR AI 수정 에이전트 트리거 (앱명 + 문제 설명 전달)
  GET  /api/status              — 모든 앱 최신 상태
  GET  /api/status/{app}        — 특정 앱 최신 상태
  GET  /api/history/{app}       — 특정 앱 점검 이력 (최근 30건)
  GET  /api/apps                — 모니터링 앱 목록

스케줄 (APScheduler):
  09:00 KST — 전체 앱 점검 (morning)
  18:00 KST — Dart Link 데이터 수신 결과 체크 (evening)
"""
import asyncio
import sys
import os
import time
from pathlib import Path
from datetime import datetime, timedelta, timezone

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
from api.database import init_db, save_results, get_latest, get_history, get_availability

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
    _start_scheduler()


def _start_scheduler():
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        import pytz

        scheduler = AsyncIOScheduler(timezone=pytz.utc)

        # 매일 00:00 UTC = 09:00 KST — 전체 앱 점검
        scheduler.add_job(
            lambda: asyncio.create_task(_run_checks(notify_slack=True)),
            trigger=CronTrigger(hour=0, minute=0, timezone=pytz.utc),
            id="morning_check",
            name="전체 앱 점검 (09:00 KST)",
            replace_existing=True,
            misfire_grace_time=1800,
        )
        # 매일 09:00 UTC = 18:00 KST — Dart Link 데이터 수신 결과 체크
        scheduler.add_job(
            lambda: asyncio.create_task(_run_evening_check()),
            trigger=CronTrigger(hour=9, minute=0, timezone=pytz.utc),
            id="evening_data_check",
            name="데이터 수신 결과 체크 (18:00 KST)",
            replace_existing=True,
            misfire_grace_time=1800,
        )
        scheduler.start()
        import logging
        logging.getLogger(__name__).info(
            "[스케줄러] 등록 완료 — 전체점검(09:00 KST) / 데이터수신체크(18:00 KST)"
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"[스케줄러] 등록 실패: {e}")


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


@app.get("/api/availability")
def availability(days: int = 7):
    """최근 N일 앱별 가용성(ok 비율) + 평균 응답속도."""
    return get_availability(days)


@app.post("/api/run")
async def run_now(background_tasks: BackgroundTasks, notify_slack: bool = False):
    global _running
    if _running:
        return {"status": "already_running", "message": "이미 점검이 실행 중입니다."}
    background_tasks.add_task(_run_checks, notify_slack)
    return {"status": "started", "message": "점검을 시작했습니다. /api/status 로 결과를 확인하세요."}


@app.post("/api/run/evening")
async def run_evening(background_tasks: BackgroundTasks):
    """Dart Link 데이터 수신 결과 체크 (18:00 KST 스케줄 or 수동 트리거)."""
    background_tasks.add_task(_run_evening_check)
    return {"status": "started", "message": "데이터 수신 결과 체크를 시작했습니다."}


@app.post("/api/trigger-fix")
async def trigger_fix(body: dict):
    """CCR 자동 수정 에이전트 트리거 — Anthropic API로 루틴 실행 요청."""
    import httpx
    app_name = body.get("app_name", "")
    issue    = body.get("issue", "")
    ccr_key  = os.environ.get("CCR_API_KEY", "")
    if not ccr_key:
        raise HTTPException(500, "CCR_API_KEY 미설정")

    routine_id = "trig_01C772TqVzW9ZgzVutGq3Eh4"
    prompt = (
        f"앱관리 에이전트: '{app_name}' 앱에 다음 문제가 감지됐습니다.\n\n"
        f"문제: {issue}\n\n"
        f"해당 앱 레포를 확인하고 문제를 진단 및 수정하세요. "
        f"수정 후 배포까지 완료하고, 결과를 Slack으로 보고하세요."
    )

    import uuid
    payload = {
        "job_config": {
            "ccr": {
                "environment_id": "env_01HpZahSCUfZEC99HG8jA79g",
                "session_context": {
                    "model": "claude-sonnet-4-6",
                    "sources": [
                        {"git_repository": {"url": "https://github.com/tobeapro74/app-management-agent"}}
                    ],
                    "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
                },
                "events": [
                    {"data": {
                        "uuid": str(uuid.uuid4()),
                        "session_id": "",
                        "type": "user",
                        "parent_tool_use_id": None,
                        "message": {"content": prompt, "role": "user"}
                    }}
                ]
            }
        }
    }

    headers = {
        "x-api-key": ccr_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"https://api.anthropic.com/v1/code_routines/triggers/{routine_id}/run",
            json=payload,
            headers=headers,
        )
    if r.status_code not in (200, 202):
        raise HTTPException(502, f"CCR 트리거 실패: {r.status_code} {r.text[:200]}")
    return {"status": "triggered", "message": f"'{app_name}' AI 수정 에이전트를 실행했습니다. 약 2~5분 후 Slack에서 결과를 확인하세요."}


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


async def _run_evening_check():
    """18:00 KST — Dart Link DART 공시 + NPS 임직원 데이터 수신 결과 체크."""
    from reporters.slack import send_slack
    from reporters.gmail import send_html_report
    from reporters.report import build_report, build_html_report

    dart_link_app = next((a for a in APPS if a.name == "Dart Link"), None)
    if not dart_link_app:
        return

    try:
        result = await dart_link_checker.check(dart_link_app, mode="evening")
    except Exception as e:
        result = CheckResult(app_name="Dart Link", status="error")
        result.errors.append(str(e))

    save_results([{
        "app_name": result.app_name,
        "status": result.status,
        "response_ms": result.response_ms,
        "details": result.details,
        "warnings": result.warnings,
        "errors": result.errors,
        "checked_at": result.checked_at,
    }])

    has_error = result.status == "error"
    has_warn = result.status == "warn"
    prefix = "🚨 [오류]" if has_error else ("⚠️ [경고]" if has_warn else "✅ [정상]")
    now_str = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
    subject = f"{prefix} Dart Link 데이터 수신 결과 — {now_str}"

    report = build_report([result])
    await send_slack(report)
    html = build_html_report([result])
    send_html_report(subject, html)


# ── Dart Monitor ops 엔드포인트 ──────────────────────────────────────────────

DM_DB_URL = os.environ.get(
    "DART_MONITOR_DB_URL",
    "postgresql://postgres.hjinjmagafuqzuilxjvw:8wE0DoXjg0KvF33z@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
)
DM_API = "https://api.dart-monitor.com"
KST = timezone(timedelta(hours=9))


def _dm_connect():
    import psycopg2
    # connect_timeout: TCP 연결 타임아웃(초), options: statement_timeout으로 쿼리 타임아웃
    return psycopg2.connect(
        DM_DB_URL,
        connect_timeout=8,
        options="-c statement_timeout=10000",
    )


def _dm_scalar(sql: str, params=None):
    try:
        con = _dm_connect()
        cur = con.cursor()
        cur.execute(sql, params) if params else cur.execute(sql)
        row = cur.fetchone()
        con.close()
        return row[0] if row else None
    except Exception:
        return None


def _dm_rows(sql: str, params=None):
    try:
        con = _dm_connect()
        cur = con.cursor()
        cur.execute(sql, params) if params else cur.execute(sql)
        rows = cur.fetchall()
        con.close()
        return rows
    except Exception:
        return []


def _dm_today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _dm_yesterday() -> str:
    return (datetime.now(KST) - timedelta(days=1)).strftime("%Y-%m-%d")


@app.get("/api/dart-monitor/ops")
def dart_monitor_ops(mode: str = "daily"):
    """Dart Monitor ops_reporter와 동일한 점검 항목을 JSON으로 반환."""
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    results = []
    EMOJI = {"ok": "✅", "warn": "⚠️", "error": "❌", "info": "📌"}

    def add(id_, name, status, value, note=""):
        results.append({
            "id": id_, "name": name, "status": status,
            "icon": EMOJI.get(status, "❌"), "value": value, "note": note,
        })

    if mode == "daily":
        # D01 — 공시 폴링
        cnt = _dm_scalar("SELECT COUNT(*) FROM disclosures WHERE rcept_dt = %s", (today,))
        if cnt and cnt > 0:
            add("D01", "DART 공시 폴링", "ok", f"{cnt:,}건")
        else:
            cnt_yd = _dm_scalar("SELECT COUNT(*) FROM disclosures WHERE rcept_dt = %s", (yesterday,))
            status = "warn" if (cnt_yd and cnt_yd > 0) else "error"
            add("D01", "DART 공시 폴링", status, f"오늘 {cnt or 0}건",
                "장 마감 전이거나 폴링 지연" if status == "warn" else "공시 수집 없음")

        # D02 — 시세 데이터
        mcap = _dm_scalar("SELECT COUNT(*) FROM market_cap_daily WHERE trade_date = %s", (today,))
        if mcap and mcap >= 2700:
            add("D02", "시세 데이터 수집", "ok", f"{mcap:,}건")
        elif mcap and mcap > 0:
            add("D02", "시세 데이터 수집", "warn", f"{mcap:,}건", "2,700건 미만 — 장 마감 전이거나 수집 불완전")
        else:
            add("D02", "시세 데이터 수집", "error", "0건", "시세 미수집")

        # D03 — ECS 배치 (MSI로 proxy)
        msi_today = _dm_scalar("SELECT COUNT(*) FROM market_sentiment_score WHERE trade_date = %s", (today,))
        if msi_today and msi_today > 0:
            msi_val = _dm_scalar("SELECT msi FROM market_sentiment_score WHERE trade_date = %s ORDER BY trade_date DESC LIMIT 1", (today,))
            add("D03", "ECS 배치 실행", "ok", f"오늘 MSI 확인: {msi_val}")
        else:
            add("D03", "ECS 배치 실행", "error" if now.hour >= 17 else "warn",
                "MSI 없음", "배치 미실행 의심 — CloudWatch 확인 필요" if now.hour >= 17 else "16:10 KST 미도래 또는 실행 중")

        # D04 — API 서버 상태
        try:
            t0 = time.time()
            import httpx as _httpx
            r = _httpx.get(f"{DM_API}/health", timeout=5)
            ms = int((time.time() - t0) * 1000)
            if r.status_code == 200 and ms < 3000:
                add("D04", "API 서버 상태", "ok", f"200 OK ({ms}ms)")
            else:
                add("D04", "API 서버 상태", "warn", f"{r.status_code} ({ms}ms)")
        except Exception as e:
            add("D04", "API 서버 상태", "error", "연결 실패", str(e)[:60])

        # D05 — 신규 공시 AI 해설 미처리
        null_today = _dm_scalar(
            "SELECT COUNT(*) FROM disclosures WHERE tier <= 3 AND rcept_dt = %s AND ai_summary IS NULL", (today,))
        if not null_today:
            add("D05", "공시 AI 해설 미처리", "ok", "0건")
        elif null_today <= 5:
            add("D05", "공시 AI 해설 미처리", "warn", f"{null_today}건", "소량 미처리 — 자동 재시도 대기")
        else:
            add("D05", "공시 AI 해설 미처리", "error", f"{null_today}건", "백필 스크립트 실행 필요")

        # D06 — MSI 값
        if msi_today and msi_today > 0:
            msi_val = _dm_scalar("SELECT msi FROM market_sentiment_score WHERE trade_date = %s LIMIT 1", (today,))
            add("D06", "MSI 업데이트", "ok", f"오늘 MSI: {msi_val}")
        else:
            add("D06", "MSI 업데이트", "warn", "미갱신", "배치 실행 후 재확인")

        # D13 — '잠시 후' 패턴 재처리
        retry_cnt = _dm_scalar("SELECT COUNT(*) FROM disclosures WHERE tier <= 3 AND ai_summary LIKE '%잠시 후%'")
        if not retry_cnt or retry_cnt == 0:
            add("D13", "AI 해설 재처리 대상", "ok", "0건")
        elif retry_cnt <= 5:
            add("D13", "AI 해설 재처리 대상", "warn", f"{retry_cnt}건", "소량 — 내일 배치에서 재처리")
        else:
            add("D13", "AI 해설 재처리 대상", "error", f"{retry_cnt}건", "즉시 재처리 필요")

        # D09 — DAU
        dau = _dm_scalar(
            "SELECT COUNT(DISTINCT user_id) FROM page_views WHERE created_at::date = %s AND user_id IS NOT NULL", (today,))
        add("D09", "DAU (오늘 접속자)", "info", f"{dau or 0}명")

        # D10 — 인기 페이지 TOP3
        top_pages = _dm_rows(
            "SELECT page, COUNT(*) as cnt FROM page_views WHERE created_at::date = %s GROUP BY page ORDER BY cnt DESC LIMIT 3", (today,))
        add("D10", "오늘 인기 페이지 TOP 3", "info",
            " / ".join(f"{r[0]}({r[1]})" for r in top_pages) if top_pages else "데이터 없음")

    elif mode == "weekly":
        week_start = (now - timedelta(days=now.weekday() + 7)).strftime("%Y-%m-%d")
        week_end = (now - timedelta(days=now.weekday() + 1)).strftime("%Y-%m-%d")

        # W01 — 주간 공시 AI 해설 누락
        null_week = _dm_scalar(
            "SELECT COUNT(*) FROM disclosures WHERE tier <= 3 AND rcept_dt BETWEEN %s AND %s AND ai_summary IS NULL",
            (week_start, week_end))
        add("W01", "주간 공시 AI 해설 누락",
            "ok" if (null_week or 0) == 0 else "error",
            "0건" if (null_week or 0) == 0 else f"{null_week}건",
            "" if (null_week or 0) == 0 else f"{week_start}~{week_end} 백필 필요")

        # W02 — 주간 시세
        mcap_days = _dm_scalar("SELECT COUNT(DISTINCT trade_date) FROM market_cap_daily WHERE trade_date BETWEEN %s AND %s", (week_start, week_end))
        mcap_rows = _dm_scalar("SELECT COUNT(*) FROM market_cap_daily WHERE trade_date BETWEEN %s AND %s", (week_start, week_end))
        add("W02", "주간 시세 수집",
            "ok" if (mcap_days or 0) >= 5 else "warn",
            f"{mcap_days or 0}일치 {(mcap_rows or 0):,}건",
            "" if (mcap_days or 0) >= 5 else "공휴일 제외 시 정상일 수 있음")

        # W03 — 주간 MSI
        msi_days = _dm_scalar("SELECT COUNT(DISTINCT trade_date) FROM market_sentiment_score WHERE trade_date BETWEEN %s AND %s", (week_start, week_end))
        add("W03", "주간 MSI 데이터",
            "ok" if (msi_days or 0) >= 5 else "warn",
            f"{msi_days or 0}일치",
            "" if (msi_days or 0) >= 5 else "평일 5일 기준 부족")

        # W05 — 추정실적 신선도
        est_latest = _dm_scalar("SELECT MAX(created_at) FROM earnings_estimates")
        if est_latest:
            days_old = (now.date() - est_latest.date()).days
            add("W05", "추정실적 컨센서스 신선도",
                "ok" if days_old <= 7 else "warn",
                f"{days_old}일 전",
                "" if days_old <= 7 else "7일 초과 — 갱신 필요")
        else:
            add("W05", "추정실적 컨센서스 신선도", "warn", "확인 불가")

        # W06 — 호재/악재 AI 해설
        up_down_null = _dm_scalar(
            "SELECT COUNT(*) FROM disclosures WHERE tier <= 2 AND direction IN ('UP','DOWN') AND rcept_dt BETWEEN %s AND %s AND ai_summary IS NULL",
            (week_start, week_end))
        add("W06", "호재/악재 AI 해설",
            "ok" if (up_down_null or 0) == 0 else "error",
            "전량 처리" if (up_down_null or 0) == 0 else f"{up_down_null}건 누락",
            "" if (up_down_null or 0) == 0 else "즉시 백필 필요")

        # WAU
        wau = _dm_scalar(
            "SELECT COUNT(DISTINCT user_id) FROM page_views WHERE created_at::date BETWEEN %s AND %s AND user_id IS NOT NULL",
            (week_start, week_end))
        add("W05", "WAU (주간 접속자)", "info", f"{wau or 0}명")

        # W06 — 신규 가입자
        new_u = _dm_scalar("SELECT COUNT(*) FROM users WHERE created_at::date BETWEEN %s AND %s", (week_start, week_end))
        total_u = _dm_scalar("SELECT COUNT(*) FROM users")
        add("W06", "주간 신규 가입자", "info", f"{new_u or 0}명 (전체 {total_u or 0}명)")

        # W07 — 인기 종목 TOP5
        top_corps = _dm_rows(
            "SELECT c.corp_name, COUNT(*) as cnt FROM page_views p"
            " LEFT JOIN companies c ON p.page = '/companies/' || c.corp_code"
            " WHERE p.page LIKE '/companies/%%' AND length(p.page) > 12"
            " AND p.created_at::date BETWEEN %s AND %s"
            " GROUP BY c.corp_name ORDER BY cnt DESC LIMIT 5",
            (week_start, week_end))
        add("W07", "인기 종목 TOP 5", "info",
            " / ".join(f"{r[0] or '?'}({r[1]})" for r in top_corps) if top_corps else "데이터 없음")

        # W08 — 인기 기능 TOP3
        top_feat = _dm_rows(
            "SELECT page, COUNT(*) as cnt FROM page_views"
            " WHERE page NOT LIKE '/companies/%%' AND page != '/'"
            " AND created_at::date BETWEEN %s AND %s"
            " GROUP BY page ORDER BY cnt DESC LIMIT 3",
            (week_start, week_end))
        add("W08", "인기 기능 TOP 3", "info",
            " / ".join(f"{r[0]}({r[1]})" for r in top_feat) if top_feat else "데이터 없음")

    # 공통 — DB 테이블 현황
    tables = {
        "disclosures": "공시", "market_cap_daily": "시세", "market_sentiment_score": "MSI",
        "users": "사용자", "earnings_estimates": "추정실적",
    }
    table_counts = {}
    for tbl, label in tables.items():
        cnt = _dm_scalar(f"SELECT COUNT(*) FROM {tbl}")
        table_counts[label] = cnt or 0

    ok_cnt   = sum(1 for r in results if r["status"] == "ok")
    warn_cnt = sum(1 for r in results if r["status"] == "warn")
    err_cnt  = sum(1 for r in results if r["status"] == "error")

    return {
        "mode": mode,
        "generated_at": now.strftime("%Y-%m-%d %H:%M KST"),
        "summary": {"ok": ok_cnt, "warn": warn_cnt, "error": err_cnt, "total": len(results)},
        "checks": results,
        "table_counts": table_counts,
    }
