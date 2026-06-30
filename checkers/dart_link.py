"""
Dart Link 앱 체커.

동작:
  1. health 엔드포인트로 서버 상태 확인
  2. Dart Link 백엔드 API로 당일 공시 처리 결과 조회
  3. 공시 발생 시 기업별 재무등급·AI 분석 요약 포함한 상세 리포트 반환
"""
import httpx
from datetime import datetime
from .base import CheckResult, ping_health, check_ssl_expiry
from config import AppConfig

DART_LINK_API = "https://api.dart-link.app"


async def _get_disclosure_results(date_str: str) -> dict:
    """당일 공시 처리 결과 조회 (/api/admin/disclosure-results)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{DART_LINK_API}/api/admin/disclosure-results",
                params={"date": date_str},
            )
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


async def check(app: AppConfig) -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    # 당일 공시 결과 조회
    today = datetime.now().strftime("%Y%m%d")
    disclosure_data = await _get_disclosure_results(today)

    found = disclosure_data.get("found", 0)
    result.details["disclosure_found"] = found
    result.details["disclosure_date"] = today

    if found > 0:
        result.details["financial_ok"] = disclosure_data.get("financial_ok", 0)
        result.details["ai_ok"] = disclosure_data.get("ai_ok", 0)
        result.details["companies"] = disclosure_data.get("companies", [])
        result.warnings.append(f"오늘 {found}개 기업 공시 — 재무수집 {disclosure_data.get('financial_ok',0)}건, AI분석 {disclosure_data.get('ai_ok',0)}건 완료")

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
