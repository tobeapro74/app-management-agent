from .base import CheckResult, ping_health
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms, details=body)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    # 예약 크론 마지막 실행 시각
    last_cron = body.get("last_cron_run")
    if last_cron:
        result.details["last_cron_run"] = last_cron

    # 이번달 예약 수
    monthly_bookings = body.get("monthly_bookings")
    if monthly_bookings is not None:
        result.details["monthly_bookings"] = monthly_bookings

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    return result
