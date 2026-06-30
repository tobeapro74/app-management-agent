"use client";

import { AppStatus } from "@/lib/api";
import { CheckCircle, AlertTriangle, XCircle, Clock } from "lucide-react";

const STATUS_CONFIG = {
  ok: { icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-50 border-emerald-200", label: "정상" },
  warn: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50 border-amber-200", label: "경고" },
  error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50 border-red-200", label: "오류" },
};

const DETAIL_LABELS: Record<string, string> = {
  total_members: "누적회원",
  dau_yesterday: "전일DAU",
  wau_yesterday: "전주WAU",
  mau_yesterday: "전월MAU",
  new_members_yesterday: "신규가입",
  restaurant_count: "맛집수",
  monthly_bookings: "월예약",
  last_cron_run: "크론실행",
  unpublished_commits: "미배포커밋",
  last_poll_at: "최근수집",
  disclosures_total: "공시누적",
  disclosure_found: "당일공시",
  financial_ok: "재무수집",
  ai_ok: "AI분석",
};

function SslBadge({ days }: { days: number }) {
  if (days < 14) return <span className="text-xs font-medium text-red-600">🔴 SSL {days}일</span>;
  if (days < 30) return <span className="text-xs font-medium text-amber-600">⚠️ SSL {days}일</span>;
  return <span className="text-xs text-slate-400">🔒 SSL {days}일</span>;
}

export default function AppCard({ s }: { s: AppStatus }) {
  const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const sslDays = s.details?.ssl_days as number | undefined;
  const checkedAt = s.checked_at ? new Date(s.checked_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-";

  const metricEntries = Object.entries(s.details ?? {}).filter(
    ([k]) => k !== "ssl_days" && k !== "companies" && k !== "disclosure_date" && DETAIL_LABELS[k]
  );

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cfg.bg}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${cfg.color}`} />
          <span className="font-semibold text-slate-800">{s.app_name}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color} bg-white border`}>
          {cfg.label}
        </span>
      </div>

      {/* 응답속도 + SSL */}
      <div className="flex items-center gap-3 text-sm text-slate-500">
        {s.response_ms != null && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {s.response_ms}ms
          </span>
        )}
        {sslDays != null && <SslBadge days={sslDays} />}
      </div>

      {/* 경고/에러 메시지 */}
      {s.warnings.length > 0 && (
        <ul className="text-xs text-amber-700 space-y-0.5">
          {s.warnings.map((w, i) => <li key={i}>⚡ {w}</li>)}
        </ul>
      )}
      {s.errors.length > 0 && (
        <ul className="text-xs text-red-700 space-y-0.5">
          {s.errors.map((e, i) => <li key={i}>🔴 {e}</li>)}
        </ul>
      )}

      {/* 핵심 지표 */}
      {metricEntries.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 border-t border-current/10 pt-2">
          {metricEntries.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-slate-400">{DETAIL_LABELS[k] ?? k}</dt>
              <dd className="font-medium text-slate-700 truncate ml-1">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* 점검 시각 */}
      <p className="text-xs text-slate-400 mt-auto">점검: {checkedAt}</p>
    </div>
  );
}
