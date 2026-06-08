from .base import CheckResult, ping_health
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms, details=body)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    # DB 연결 상태
    db_status = body.get("checks", {}).get("db", "unknown")
    if db_status != "ok":
        result.status = "warn"
        result.warnings.append(f"DB 상태: {db_status}")

    # DART 수집기 상태
    collector_status = body.get("checks", {}).get("dart_collector", "unknown")
    if collector_status == "no_data":
        result.status = "warn"
        result.warnings.append("DART 수집기: 수집 이력 없음")
    elif collector_status not in ("ok", "unknown"):
        result.status = "warn"
        result.warnings.append(f"DART 수집기 상태: {collector_status}")

    # 핵심 지표
    if body.get("last_poll_at"):
        result.details["last_poll_at"] = body["last_poll_at"]
    if body.get("disclosures_total") is not None:
        result.details["disclosures_total"] = body["disclosures_total"]

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    return result
