import ssl
import socket
import certifi
import httpx
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class CheckResult:
    app_name: str
    status: str          # "ok" | "warn" | "error"
    response_ms: int | None = None
    details: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    checked_at: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


def check_ssl_expiry(hostname: str) -> int | None:
    """SSL 인증서 만료까지 남은 일수 반환. 실패 시 None."""
    try:
        ctx = ssl.create_default_context(cafile=certifi.where())
        with ctx.wrap_socket(socket.create_connection((hostname, 443), timeout=5), server_hostname=hostname) as s:
            cert = s.getpeercert()
            exp_str = cert.get("notAfter", "")
            exp_dt = datetime.strptime(exp_str, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            return (exp_dt - datetime.now(timezone.utc)).days
    except Exception:
        return None


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
