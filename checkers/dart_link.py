"""
Dart Link 앱 체커.

동작:
  1. health 엔드포인트로 서버 상태 확인
  2. Dart Link 백엔드 API로 당일 공시 처리 결과 조회
  3. 공시 발생 시 기업별 재무등급·AI 분석 요약 포함한 상세 리포트 반환

evening 모드 (18:00 KST):
  - DART 공시 체크 결과 확인
  - NPS 임직원 데이터 갱신 결과 확인
"""
import httpx
from datetime import datetime, timezone, timedelta
from .base import CheckResult, ping_health, check_ssl_expiry
from config import AppConfig

DART_LINK_API = "https://api.dart-link.app"
KST = timezone(timedelta(hours=9))


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


async def _get_nps_status() -> dict:
    """NPS 임직원 데이터 갱신 현황 조회 (/api/admin/nps-status)."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{DART_LINK_API}/api/admin/nps-status")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {}


async def check(app: AppConfig, mode: str = "morning") -> CheckResult:
    ok, ms, body = await ping_health(app.health_url)
    result = CheckResult(app_name=app.name, status="ok", response_ms=ms)

    if not ok:
        result.status = "error"
        result.errors.append(body.get("error", "health check 실패"))
        return result

    if ms and ms > 3000:
        result.status = "warn"
        result.warnings.append(f"응답 지연: {ms}ms")

    today = datetime.now(KST).strftime("%Y%m%d")

    if mode == "evening":
        # ── 오후 6시 체크: DART 공시 + NPS 갱신 결과 ──
        disclosure_data = await _get_disclosure_results(today)
        found = disclosure_data.get("found", 0)
        result.details["disclosure_found"] = found
        result.details["disclosure_date"] = today

        if found > 0:
            result.details["financial_ok"] = disclosure_data.get("financial_ok", 0)
            result.details["ai_ok"] = disclosure_data.get("ai_ok", 0)
            result.warnings.append(
                f"공시 {found}건 — 재무 {disclosure_data.get('financial_ok',0)}건 / AI {disclosure_data.get('ai_ok',0)}건 처리"
            )
        else:
            result.details["disclosure_note"] = "오늘 신규 공시 없음"

        # NPS 갱신 현황
        nps_data = await _get_nps_status()
        nps_updated = nps_data.get("updated_today", 0)
        nps_total = nps_data.get("total", 0)
        result.details["nps_updated_today"] = nps_updated
        result.details["nps_total"] = nps_total

        if nps_updated == 0:
            result.status = "warn"
            result.warnings.append("NPS 임직원 데이터 — 오늘 갱신 없음 (스케줄러 확인 필요)")
        else:
            result.details["nps_note"] = f"NPS 임직원 데이터 {nps_updated}개 갱신 완료"

    else:
        # ── 오전 9시 체크: 공시 결과 + SSL ──
        disclosure_data = await _get_disclosure_results(today)
        found = disclosure_data.get("found", 0)
        result.details["disclosure_found"] = found
        result.details["disclosure_date"] = today

        if found > 0:
            result.details["financial_ok"] = disclosure_data.get("financial_ok", 0)
            result.details["ai_ok"] = disclosure_data.get("ai_ok", 0)
            result.details["companies"] = disclosure_data.get("companies", [])
            result.warnings.append(
                f"오늘 {found}개 기업 공시 — 재무수집 {disclosure_data.get('financial_ok',0)}건, AI분석 {disclosure_data.get('ai_ok',0)}건 완료"
            )

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
