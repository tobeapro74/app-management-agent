import httpx
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class CheckResult:
    app_name: str
    status: str          # "ok" | "warn" | "error"
    response_ms: int | None = None
    details: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    checked_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


async def ping_health(url: str, timeout: int = 10) -> tuple[bool, int | None, dict]:
    """health 엔드포인트 호출. (성공여부, 응답ms, JSON 본문) 반환."""
    try:
        async with httpx.AsyncClient() as client:
            start = datetime.now()
            resp = await client.get(url, timeout=timeout)
            ms = int((datetime.now() - start).total_seconds() * 1000)
            if resp.status_code == 200:
                try:
                    body = resp.json()
                except Exception:
                    body = {}
                return True, ms, body
            return False, ms, {"http_status": resp.status_code}
    except httpx.TimeoutException:
        return False, None, {"error": "timeout"}
    except Exception as e:
        return False, None, {"error": str(e)}
