from .base import CheckResult, ping_health
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms, details=body)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    # 리뷰 크론 마지막 실행 시각
    last_cron = body.get("last_cron_run")
    if last_cron:
        result.details["last_cron_run"] = last_cron

    # 등록 맛집 수
    restaurant_count = body.get("restaurant_count")
    if restaurant_count is not None:
        result.details["restaurant_count"] = restaurant_count

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    return result
