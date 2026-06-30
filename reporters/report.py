from datetime import datetime
from checkers.base import CheckResult

STATUS_ICON = {"ok": "✅", "warn": "⚠️", "error": "❌"}

DETAIL_LABELS = {
    "restaurant_count": "맛집수",
    "restaurant_count_diff": "맛집증감",
    "monthly_bookings": "월예약수",
    "total_members": "누적회원",
    "dau_yesterday": "전일DAU",
    "wau_yesterday": "전주WAU",
    "mau_yesterday": "전월MAU",
    "new_members_yesterday": "신규가입",
    "last_cron_run": "크론실행",
    "cron_opened_count": "크론횟수",
    "unpublished_commits": "미배포커밋",
    "last_poll_at": "최근수집",
    "disclosures_total": "공시누적",
    "disclosure_found": "당일공시",
    "financial_ok": "재무수집",
    "ai_ok": "AI분석",
    "ssl_days": "SSL만료",
}


def _ssl_badge(days: int) -> str:
    if days < 14:
        return f"🔴 SSL {days}일"
    elif days < 30:
        return f"⚠️ SSL {days}일"
    return f"🔒 SSL {days}일"


def build_report(results: list[CheckResult]) -> str:
    today = datetime.now().strftime("%Y.%m.%d")
    lines = [f"📊 *[앱 일일 점검 리포트 - {today}]*\n"]

    for r in results:
        icon = STATUS_ICON.get(r.status, "❓")
        ms_str = f" `{r.response_ms}ms`" if r.response_ms else ""
        lines.append(f"{icon} *{r.app_name}*{ms_str}")

        for w in r.warnings:
            lines.append(f"  ⚡ {w}")
        for e in r.errors:
            lines.append(f"  🔴 {e}")

        # 핵심 지표 — 라벨 매핑 적용
        metric_parts = []
        for k, label in DETAIL_LABELS.items():
            if k not in r.details or k == "companies":
                continue
            if k == "ssl_days":
                metric_parts.append(_ssl_badge(r.details[k]))
            else:
                metric_parts.append(f"{label}: {r.details[k]}")
        if metric_parts:
            lines.append("  › " + " | ".join(metric_parts))

        lines.append("")

    actions = [
        f"  {i+1}. *{r.app_name}*: {'; '.join(r.errors + r.warnings)}"
        for i, r in enumerate(results)
        if r.status != "ok"
    ]
    if actions:
        lines.append("🔧 *조치 필요 사항*")
        lines.extend(actions)
    else:
        lines.append("✨ 모든 앱 정상 운영 중")

    return "\n".join(lines)
