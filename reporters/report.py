from datetime import datetime, timezone, timedelta
from checkers.base import CheckResult

KST = timezone(timedelta(hours=9))

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


def build_html_report(results: list[CheckResult]) -> str:
    """Gmail용 HTML 보고서 생성."""
    now_str = datetime.now(KST).strftime("%Y-%m-%d %H:%M")
    ok_cnt = sum(1 for r in results if r.status == "ok")
    warn_cnt = sum(1 for r in results if r.status == "warn")
    err_cnt = sum(1 for r in results if r.status == "error")

    summary_color = "#dc2626" if err_cnt > 0 else ("#d97706" if warn_cnt > 0 else "#16a34a")
    summary_text = f"❌ 오류 {err_cnt}건" if err_cnt > 0 else (f"⚠️ 경고 {warn_cnt}건" if warn_cnt > 0 else "✅ 전체 정상")

    rows_html = ""
    for r in results:
        status_color = {"ok": "#16a34a", "warn": "#d97706", "error": "#dc2626"}.get(r.status, "#6b7280")
        status_bg = {"ok": "#f0fdf4", "warn": "#fffbeb", "error": "#fef2f2"}.get(r.status, "#f9fafb")
        icon = STATUS_ICON.get(r.status, "❓")
        ms_str = f" <span style='color:#9ca3af;font-size:11px'>({r.response_ms}ms)</span>" if r.response_ms else ""

        issues = []
        for e in r.errors:
            issues.append(f"<span style='color:#dc2626'>🔴 {e}</span>")
        for w in r.warnings:
            issues.append(f"<span style='color:#d97706'>⚡ {w}</span>")
        issues_html = "<br>".join(issues) if issues else ""

        metrics = []
        for k, v in r.details.items():
            if k == "ssl_days":
                metrics.append(_ssl_badge(v))
            else:
                label = DETAIL_LABELS.get(k, k)
                metrics.append(f"{label}: {v}")
        metrics_html = " &nbsp;|&nbsp; ".join(metrics) if metrics else ""

        rows_html += f"""
        <tr style='background:{status_bg}'>
          <td style='padding:10px 14px;font-weight:600;white-space:nowrap'>
            {icon} {r.app_name}{ms_str}
          </td>
          <td style='padding:10px 14px;color:{status_color};font-weight:700'>
            {r.status.upper()}
          </td>
          <td style='padding:10px 14px;font-size:12px;color:#374151'>
            {issues_html}
            {'<br>' if issues_html and metrics_html else ''}
            <span style='color:#6b7280'>{metrics_html}</span>
          </td>
        </tr>"""

    actions = [r for r in results if r.status != "ok"]
    action_html = ""
    if actions:
        items = "".join(
            f"<li><strong>{r.app_name}</strong>: {'; '.join(r.errors + r.warnings)}</li>"
            for r in actions
        )
        action_html = f"""
        <div style='background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;margin-top:16px;border-radius:0 8px 8px 0'>
          <p style='margin:0 0 8px;font-weight:700;color:#dc2626'>🔧 조치 필요 사항</p>
          <ul style='margin:0;padding-left:18px;color:#374151;font-size:13px'>{items}</ul>
        </div>"""

    return f"""<!DOCTYPE html>
<html><head><meta charset='utf-8'>
<style>
  body{{font-family:-apple-system,sans-serif;margin:0;background:#f8fafc}}
  .wrap{{max-width:700px;margin:0 auto;padding:24px}}
  .header{{background:#1e293b;color:white;padding:20px 24px;border-radius:12px 12px 0 0}}
  .header h1{{margin:0;font-size:18px;font-weight:700}}
  .header p{{margin:4px 0 0;font-size:12px;opacity:.7}}
  .summary{{background:white;padding:14px 20px;border-bottom:2px solid #f1f5f9;display:flex;align-items:center;gap:16px}}
  .badge{{font-size:14px;font-weight:700;color:{summary_color}}}
  .stat{{font-size:12px;color:#6b7280}}
  table{{width:100%;border-collapse:collapse;background:white}}
  th{{background:#f1f5f9;padding:9px 14px;font-size:11px;color:#64748b;text-align:left;border-bottom:2px solid #e2e8f0;text-transform:uppercase;letter-spacing:.5px}}
  td{{border-bottom:1px solid #f8fafc;font-size:13px;vertical-align:top}}
  .footer{{background:#f1f5f9;padding:10px 20px;border-radius:0 0 12px 12px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0}}
</style></head>
<body><div class='wrap'>
  <div class='header'>
    <h1>🛠️ 앱관리 일일 점검 리포트</h1>
    <p>{now_str} KST &nbsp;·&nbsp; 총 {len(results)}개 앱</p>
  </div>
  <div class='summary'>
    <span class='badge'>{summary_text}</span>
    <span class='stat'>✅ 정상 {ok_cnt} &nbsp; ⚠️ 경고 {warn_cnt} &nbsp; ❌ 오류 {err_cnt}</span>
  </div>
  <table>
    <tr><th>앱</th><th>상태</th><th>상세</th></tr>
    {rows_html}
  </table>
  {action_html}
  <div class='footer'>자동 생성 — 앱관리_Agent &nbsp;·&nbsp; tobeapro@gmail.com</div>
</div></body></html>"""
