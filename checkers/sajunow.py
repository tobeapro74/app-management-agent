from .base import CheckResult, ping_health
from config import AppConfig


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms, details=body)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    # 미배포 커밋 경고
    unpublished = body.get("unpublished_commits", 0)
    if unpublished and unpublished > 0:
        result.status = "warn"
        result.warnings.append(f"develop 브랜치 미배포 커밋 {unpublished}건")

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    return result
