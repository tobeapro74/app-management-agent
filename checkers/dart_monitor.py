"""DART Monitor 전용 상세 점검 체커."""
import os
import psycopg2
from .base import CheckResult, ping_health, check_ssl_expiry
from config import AppConfig

DB_URL = os.getenv(
    "DART_MONITOR_DB_URL",
    "postgresql://postgres.hjinjmagafuqzuilxjvw:8wE0DoXjg0KvF33z@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres",
)


def _db_scalar(sql: str, params=None):
    try:
        con = psycopg2.connect(DB_URL, connect_timeout=10)
        cur = con.cursor()
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        row = cur.fetchone()
        con.close()
        return row[0] if row else None
    except Exception as e:
        return f"DB_ERROR:{e}"


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms)

    # ── API 서버 상태 ──
    if not ok:
        result.status = "error"
        result.errors.append(f"API 서버 응답 없음: {body.get('error', 'unknown')}")
        return result

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"API 응답 지연: {ms}ms")

    # ── SSL ──
    ssl_days = check_ssl_expiry(app.hostname)
    if ssl_days is not None:
        result.details["ssl_days"] = ssl_days
        if ssl_days < 14:
            result.status = "error"
            result.errors.append(f"SSL 인증서 만료 {ssl_days}일 남음")
        elif ssl_days < 30:
            result.status = "warn"
            result.warnings.append(f"SSL 인증서 만료 {ssl_days}일 남음")

    # ── DB 점검 ──
    from datetime import date
    today = date.today().isoformat()

    # 당일 공시 수집
    disc_today = _db_scalar(
        "SELECT COUNT(*) FROM disclosures WHERE rcept_dt = %s", (today,)
    )
    if isinstance(disc_today, str):
        result.status = "warn"
        result.warnings.append("DB 연결 실패")
    else:
        result.details["당일공시"] = f"{disc_today}건"
        if disc_today == 0:
            from datetime import datetime, timezone, timedelta
            kst_hour = datetime.now(timezone(timedelta(hours=9))).hour
            if kst_hour >= 10:
                result.status = "warn"
                result.warnings.append("당일 공시 수집 없음 (오전 10시 이후)")

    # AI 해설 미처리
    null_today = _db_scalar(
        "SELECT COUNT(*) FROM disclosures WHERE tier <= 3 AND rcept_dt = %s AND ai_summary IS NULL",
        (today,),
    )
    if isinstance(null_today, int):
        result.details["AI해설미처리"] = f"{null_today}건"
        if null_today > 10:
            result.status = "warn"
            result.warnings.append(f"AI 해설 미처리 {null_today}건")

    # 시세 수집
    mcap_today = _db_scalar(
        "SELECT COUNT(*) FROM market_cap_daily WHERE trade_date = %s", (today,)
    )
    if isinstance(mcap_today, int):
        result.details["시세수집"] = f"{mcap_today}건"
        from datetime import datetime, timezone, timedelta
        kst_hour = datetime.now(timezone(timedelta(hours=9))).hour
        if kst_hour >= 17 and mcap_today < 2700:
            result.status = "warn"
            result.warnings.append(f"시세 수집 부족: {mcap_today}건 (기준 2,700)")

    # MSI 업데이트
    msi_today = _db_scalar(
        "SELECT COUNT(*) FROM market_sentiment_score WHERE trade_date = %s", (today,)
    )
    if isinstance(msi_today, int):
        from datetime import datetime, timezone, timedelta
        kst_hour = datetime.now(timezone(timedelta(hours=9))).hour
        if kst_hour >= 17 and msi_today == 0:
            result.status = "warn"
            result.warnings.append("MSI 미갱신")
        else:
            result.details["MSI"] = "갱신됨" if msi_today > 0 else "미갱신"

    # 전체 공시 누적
    total_disc = _db_scalar("SELECT COUNT(*) FROM disclosures")
    if isinstance(total_disc, int):
        result.details["공시누적"] = f"{total_disc:,}건"

    # 사용자 수
    total_users = _db_scalar("SELECT COUNT(*) FROM users")
    if isinstance(total_users, int):
        result.details["가입자"] = f"{total_users}명"

    return result
