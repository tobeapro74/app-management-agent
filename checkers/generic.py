from .base import CheckResult, ping_health, check_ssl_expiry
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    status = body.get("status", "ok")
    result.status = "warn" if status == "degraded" else status

    for key in ("total_members", "dau_yesterday", "new_members_yesterday",
                "wau_yesterday", "mau_yesterday"):
        if key in body:
            result.details[key] = body[key]

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    ssl_days = check_ssl_expiry(app.hostname)
    if ssl_days is not None:
        result.details["ssl_days"] = ssl_days
        if ssl_days < 14:
            result.status = "error"
            result.errors.append(f"SSL 인증서 만료 {ssl_days}일 남음")
        elif ssl_days < 30:
            if result.status == "ok":
                result.status = "warn"
            result.warnings.append(f"SSL 인증서 만료 {ssl_days}일 남음")

    return result
