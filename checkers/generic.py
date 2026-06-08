from .base import CheckResult, ping_health
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, response_ms=ms, details=body)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    status = body.get("status", "ok")
    result.status = "warn" if status == "degraded" else status

    for key in ("total_members", "dau_yesterday", "new_members_yesterday"):
        if key in body:
            result.details[key] = body[key]

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    return result
