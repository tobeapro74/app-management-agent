from datetime import datetime
from checkers.base import CheckResult

STATUS_ICON = {"ok": "✅", "warn": "⚠️", "error": "❌"}


def build_report(results: list[CheckResult]) -> str:
    today = datetime.now().strftime("%Y.%m.%d")
    lines = [f"📊 [앱 일일 점검 리포트 - {today}]\n"]

    for r in results:
        icon = STATUS_ICON.get(r.status, "❓")
        ms_str = f" (응답 {r.response_ms}ms)" if r.response_ms else ""
        lines.append(f"{icon} {r.app_name}{ms_str}")

        for w in r.warnings:
            lines.append(f"  ⚡ {w}")
        for e in r.errors:
            lines.append(f"  🔴 {e}")

        # 핵심 지표만 표시
        SHOW_KEYS = ("restaurant_count", "restaurant_count_diff", "monthly_bookings",
                     "last_cron_run", "cron_opened_count", "unpublished_commits",
                     "last_poll_at", "disclosures_total")
        for k in SHOW_KEYS:
            if k in r.details:
                lines.append(f"  - {k}: {r.details[k]}")

        lines.append("")

    actions = [
        f"  {i+1}. {r.app_name}: {'; '.join(r.errors + r.warnings)}"
        for i, r in enumerate(results)
        if r.status != "ok"
    ]
    if actions:
        lines.append("🔧 조치 필요 사항")
        lines.extend(actions)
    else:
        lines.append("✨ 모든 앱 정상 운영 중")

    return "\n".join(lines)
