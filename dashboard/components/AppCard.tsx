"use client";

import { useState } from "react";
import { AppStatus, RecheckResult, recheckApp } from "@/lib/api";
import { CheckCircle, AlertTriangle, XCircle, Clock, RefreshCw, Copy } from "lucide-react";

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

function hasSlowResponse(s: AppStatus) {
  return s.warnings.some(w => w.includes("응답 지연"));
}

function hasHealthError(s: AppStatus) {
  return s.status === "error";
}

function hasSslWarning(s: AppStatus) {
  const days = s.details?.ssl_days as number | undefined;
  return days != null && days < 30;
}

export default function AppCard({
  s,
  onRecheckDone,
}: {
  s: AppStatus;
  onRecheckDone?: (result: RecheckResult) => void;
}) {
  const [rechecking, setRechecking] = useState(false);
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [copied, setCopied] = useState(false);

  const display = recheckResult ?? s;
  const cfg = STATUS_CONFIG[display.status] ?? STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const sslDays = display.details?.ssl_days as number | undefined;
  const checkedAt = display.checked_at
    ? new Date(display.checked_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "-";

  const metricEntries = Object.entries(display.details ?? {}).filter(
    ([k]) => k !== "ssl_days" && k !== "companies" && k !== "disclosure_date" && DETAIL_LABELS[k]
  );

  const needsAction = hasSlowResponse(s) || hasHealthError(s) || hasSslWarning(s);

  async function handleWarmup() {
    setRechecking(true);
    setRecheckResult(null);
    try {
      const res = await recheckApp(s.app_name);
      setRecheckResult(res);
      onRecheckDone?.(res);
    } catch {
      // 실패 시 원래 상태 유지
    } finally {
      setRechecking(false);
    }
  }

  function handleCopySsl() {
    const hostname = s.app_name.toLowerCase().replace(/\s/g, "-");
    const cmd = `# SSL 갱신 가이드 — ${s.app_name}\n# Vercel/Railway는 자동 갱신됩니다.\n# 만료 이전에 재배포하거나 대시보드에서 도메인 재인증을 시도하세요.\n# 도메인: ${hostname}`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
        {display.response_ms != null && (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {display.response_ms}ms
          </span>
        )}
        {sslDays != null && <SslBadge days={sslDays} />}
      </div>

      {/* 경고/에러 메시지 */}
      {display.warnings.length > 0 && (
        <ul className="text-xs text-amber-700 space-y-0.5">
          {display.warnings.map((w, i) => <li key={i}>⚡ {w}</li>)}
        </ul>
      )}
      {display.errors.length > 0 && (
        <ul className="text-xs text-red-700 space-y-0.5">
          {display.errors.map((e, i) => <li key={i}>🔴 {e}</li>)}
        </ul>
      )}

      {/* warm-up 결과 배너 */}
      {recheckResult && (
        <div className={`text-xs rounded-lg px-3 py-2 font-medium ${
          recheckResult.resolved
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {recheckResult.resolved
            ? `✅ 재점검 후 정상 (${recheckResult.response_ms}ms, ${recheckResult.attempts}회 시도)`
            : `⚠️ 재점검에도 ${recheckResult.status} — 실제 장애일 수 있습니다`}
          {recheckResult.response_times.length > 1 && (
            <span className="ml-1 text-slate-500">
              [{recheckResult.response_times.map(t => `${t}ms`).join(" → ")}]
            </span>
          )}
        </div>
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

      {/* 조치 버튼 */}
      {needsAction && (
        <div className="flex flex-wrap gap-2 border-t border-current/10 pt-2">
          {(hasSlowResponse(s) || hasHealthError(s)) && (
            <button
              onClick={handleWarmup}
              disabled={rechecking}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 disabled:opacity-50 font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? "animate-spin" : ""}`} />
              {rechecking ? "재점검 중…" : "Warm-up 재점검"}
            </button>
          )}
          {hasSslWarning(s) && (
            <button
              onClick={handleCopySsl}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "복사됨 ✓" : "SSL 갱신 가이드"}
            </button>
          )}
        </div>
      )}

      {/* 점검 시각 */}
      <p className="text-xs text-slate-400 mt-auto">점검: {checkedAt}</p>
    </div>
  );
}
