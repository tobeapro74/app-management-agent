"""
Dart Link 공시 알림 슬랙 리포트 포맷터.

공시 발생 시 기업별 재무등급·AI 분석 요약을 슬랙에 전송.
공시가 없는 날은 리포트 생략.
"""
from datetime import datetime
from checkers.base import CheckResult

GRADE_EMOJI = {
    "우수": "🟢",
    "양호": "🔵",
    "보통": "🟡",
    "주의": "🟠",
    "위험": "🔴",
}


def build_dart_link_disclosure_report(result: CheckResult) -> str:
    """
    Dart Link 공시 결과 슬랙 메시지 생성.
    공시가 없으면 None 반환 (발송 생략).
    """
    found = result.details.get("disclosure_found", 0)
    if found == 0:
        return None

    date_str = result.details.get("disclosure_date", datetime.now().strftime("%Y%m%d"))
    date_fmt = f"{date_str[:4]}.{date_str[4:6]}.{date_str[6:]}"

    fin_ok = result.details.get("financial_ok", 0)
    ai_ok = result.details.get("ai_ok", 0)
    companies = result.details.get("companies", [])

    lines = [
        f"📢 *[Dart Link] {date_fmt} 공시 알림*",
        f"총 *{found}개* 기업 신규 감사보고서 공시 발견",
        f"재무수집 {fin_ok}건 완료 | AI분석 {ai_ok}건 완료",
        "",
    ]

    for i, c in enumerate(companies[:10], 1):
        corp_name = c.get("corp_name", "-")
        grade = c.get("stability_grade", "-")
        grade_icon = GRADE_EMOJI.get(grade, "⚪")
        report_nm = c.get("report_nm", "감사보고서")
        year = c.get("year", "-")

        lines.append(f"*{i}. {corp_name}* — {grade_icon} {grade} ({year}년)")

        stability_text = c.get("stability_text")
        if stability_text:
            lines.append(f"  📊 재무: {stability_text[:80]}{'...' if len(stability_text) > 80 else ''}")

        business_text = c.get("business_text")
        if business_text:
            lines.append(f"  📈 영업: {business_text[:80]}{'...' if len(business_text) > 80 else ''}")

        contact_points = c.get("contact_points", [])
        if contact_points:
            pt = contact_points[0]
            lines.append(f"  🎯 영업포인트: {pt.get('title','')} — {pt.get('desc','')[:60]}{'...' if len(pt.get('desc','')) > 60 else ''}")

        recommended = c.get("recommended_products", [])
        if recommended:
            lines.append(f"  💼 추천상품: {', '.join(recommended[:3])}")

        link = f"https://dart-link.vercel.app/companies/{c.get('company_id','')}"
        lines.append(f"  🔗 <{link}|상세보기>")
        lines.append("")

    if len(companies) > 10:
        lines.append(f"_외 {len(companies) - 10}개 기업은 앱에서 확인하세요._")
        lines.append("")

    lines.append(f"🔗 <https://dart-link.vercel.app|Dart Link 바로가기>")

    return "\n".join(lines)


async def send_disclosure_report(result: CheckResult, webhook_url: str) -> bool:
    """공시 결과 슬랙 발송. 공시 없으면 False 반환."""
    import httpx
    message = build_dart_link_disclosure_report(result)
    if not message:
        return False
    if not webhook_url:
        print("[Slack/DartLink] SLACK_WEBHOOK_URL 미설정")
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                webhook_url,
                json={"text": message},
                timeout=10,
            )
        return resp.status_code == 200
    except Exception as e:
        print(f"[Slack/DartLink] 발송 실패: {e}")
        return False
