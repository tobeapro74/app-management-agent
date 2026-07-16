"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppStatus, RecheckResult, recheckApp, fetchHistory, triggerFix } from "@/lib/api";
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Copy, ExternalLink, Wrench } from "lucide-react";
import ArcGauge from "./ArcGauge";
import Sparkline from "./Sparkline";

const STATUS_CONFIG = {
  ok:    { icon: CheckCircle,   color: "text-emerald-400", border: "border-emerald-500/30", dot: "bg-emerald-400", label: "정상" },
  warn:  { icon: AlertTriangle, color: "text-amber-400",   border: "border-amber-500/30",   dot: "bg-amber-400",   label: "경고" },
  error: { icon: XCircle,       color: "text-red-400",     border: "border-red-500/30",     dot: "bg-red-400",     label: "오류" },
};

const DETAIL_LABELS: Record<string, string> = {
  total_members:         "누적회원",
  dau_yesterday:         "전일DAU",
  wau_yesterday:         "전주WAU",
  mau_yesterday:         "전월MAU",
  new_members_yesterday: "신규가입",
  restaurant_count:      "맛집수",
  monthly_bookings:      "월예약",
  last_cron_run:         "크론실행",
  unpublished_commits:   "미배포커밋",
  last_poll_at:          "최근수집",
  disclosures_total:     "공시누적",
  disclosure_found:      "당일공시",
  financial_ok:          "재무수집",
  ai_ok:                 "AI분석",
  total_documents:       "누적문서",
};

const MS_MAX = 5000;
const SSL_MAX = 90;

function msToGaugeValue(ms: number) { return Math.min(100, (ms / MS_MAX) * 100); }
function sslToGaugeValue(days: number) { return Math.min(100, (days / SSL_MAX) * 100); }

function hasSlowResponse(s: AppStatus) { return s.warnings.some(w => w.includes("응답 지연")); }
function hasHealthError(s: AppStatus)  { return s.status === "error"; }
function hasSslWarning(s: AppStatus)   {
  const d = s.details?.ssl_days as number | undefined;
  return d != null && d < 30;
}

function sparkColor(status: string) {
  if (status === "error") return "#f87171";
  if (status === "warn")  return "#fbbf24";
  return "#34d399";
}

export default function AppCard({
  s,
  availability,
  onRecheckDone,
}: {
  s: AppStatus;
  availability?: number | null;
  onRecheckDone?: (result: RecheckResult) => void;
}) {
  const [rechecking, setRechecking]       = useState(false);
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [copied, setCopied]               = useState(false);
  const [sparkData, setSparkData]         = useState<number[]>([]);
  const [fixing, setFixing]               = useState(false);
  const [fixMsg, setFixMsg]               = useState<string | null>(null);

  // 스파크라인 데이터 로드 (최근 20건 응답속도)
  useEffect(() => {
    fetchHistory(s.app_name, 20).then(rows => {
      const ms = rows
        .map(r => r.response_ms)
        .filter((v): v is number => v != null)
        .reverse(); // 오래된것→최신 순
      setSparkData(ms);
    }).catch(() => {});
  }, [s.app_name, s.checked_at]);

  const display  = recheckResult ?? s;
  const cfg      = STATUS_CONFIG[display.status] ?? STATUS_CONFIG.error;
  const Icon     = cfg.icon;
  const sslDays  = display.details?.ssl_days as number | undefined;
  const checkedAt = display.checked_at
    ? (() => {
        const raw = display.checked_at;
        // Railway가 timezone 없이 UTC 시각을 저장하므로 'Z'가 없으면 붙여서 UTC로 강제 파싱
        const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
        const dt = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
        return dt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" });
      })()
    : "-";

  const d = display.details ?? {};

  function fmt(v: unknown): string {
    if (v == null) return "—";
    return (v as number).toLocaleString("ko-KR");
  }

  // 공통 지표 (모든 앱 고정 표시)
  const commonMetrics: [string, string][] = [
    ["누적회원", d.total_members != null ? fmt(d.total_members) : d.total_documents != null ? fmt(d.total_documents) : "—"],
    ["전일DAU",  fmt(d.dau_yesterday)],
    ["신규가입",  fmt(d.new_members_yesterday)],
  ];

  // 앱별 추가 지표 (1개만)
  const APP_EXTRA: Record<string, [string, string]> = {
    "N2골프":      ["월예약",   fmt(d.monthly_bookings)],
    "여의도 한끼":  ["맛집수",   fmt(d.restaurant_count)],
    "Dart Link":   ["당일공시",  fmt(d.disclosure_found)],
    "Dart Monitor":["공시누적",  fmt(d.disclosures_total)],
    "makedocu":    ["전일문서",  fmt(d.dau_yesterday)],
  };
  const extraMetric = APP_EXTRA[s.app_name] ?? null;

  const needsAction = hasSlowResponse(s) || hasHealthError(s) || hasSslWarning(s);
  const showMsGauge    = display.response_ms != null;
  const showSslGauge   = sslDays != null;
  const showAvailGauge = availability != null;
  const showGaugeRow   = showMsGauge || showSslGauge || showAvailGauge;

  async function handleWarmup() {
    setRechecking(true);
    setRecheckResult(null);
    try {
      const res = await recheckApp(s.app_name);
      setRecheckResult(res);
      onRecheckDone?.(res);
    } catch { /* 원래 상태 유지 */ } finally {
      setRechecking(false);
    }
  }

  function handleCopySsl() {
    const cmd = `# SSL 갱신 가이드 — ${s.app_name}\n# Vercel/Railway: 재배포 또는 대시보드에서 도메인 재인증을 시도하세요.`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFix() {
    setFixing(true);
    setFixMsg(null);
    const issues = [
      ...display.errors,
      ...display.warnings,
    ].join("; ") || `상태: ${display.status}`;
    try {
      const res = await triggerFix(s.app_name, issues);
      setFixMsg(res.message);
    } catch {
      setFixMsg("⚠️ AI 수정 에이전트 트리거 실패");
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className={`rounded-xl border bg-slate-800/60 backdrop-blur-sm p-4 flex flex-col gap-3 ${cfg.border} hover:bg-slate-800/80 transition-colors`}>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${cfg.dot} shadow-lg`}
                style={{ boxShadow: `0 0 6px ${cfg.dot.replace("bg-", "").replace("-400", "")}` }} />
          <span className="font-semibold text-slate-100 text-sm">{s.app_name}</span>
        </div>
        <div className="flex items-center gap-2">
          {display.response_ms != null && (
            <span className="text-xs font-mono text-slate-400">
              {display.response_ms}<span className="text-slate-500 text-[10px]">ms</span>
            </span>
          )}
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.color} border-current/30 bg-current/10`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* 게이지 행 */}
      {showGaugeRow && (
        <div className="flex justify-around items-end pt-2 pb-2 border-b border-slate-700/50">
          {showMsGauge && (
            <ArcGauge
              value={msToGaugeValue(display.response_ms!)}
              label="응답속도"
              displayValue={`${display.response_ms}ms`}
              thresholds={[60, 80]}
            />
          )}
          {showSslGauge && (
            <ArcGauge
              value={sslToGaugeValue(sslDays!)}
              label="SSL 잔여"
              displayValue={`${sslDays}일`}
              thresholds={[34, 16]}
              invert
            />
          )}
          {showAvailGauge && (
            <ArcGauge
              value={availability!}
              label="7일 가용성"
              thresholds={[90, 70]}
              invert
            />
          )}
        </div>
      )}

      {/* 스파크라인 */}
      {sparkData.length >= 3 && (() => {
        const avg = Math.round(sparkData.reduce((a, b) => a + b, 0) / sparkData.length);
        const current = display.response_ms ?? 0;
        const isSlow = current > 3000;
        const isColdStart = isSlow && avg < 1500 && current > avg * 2;
        const diagBadge = isColdStart
          ? { text: "❄️ 콜드 스타트 의심", cls: "text-sky-400 bg-sky-900/30 border-sky-500/30" }
          : isSlow
          ? { text: "⚡ 응답 지연", cls: "text-amber-400 bg-amber-900/30 border-amber-500/30" }
          : null;

        return (
        <div className="flex flex-col gap-0.5 px-0.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">응답속도 추이</span>
            <span className="text-[10px] font-mono text-slate-500">
              avg {avg}ms
            </span>
          </div>
          <Sparkline
            data={sparkData}
            width={220}
            height={36}
            color={sparkColor(display.status)}
          />
          {diagBadge && (
            <span className={`mt-1 self-start text-[10px] font-medium px-2 py-0.5 rounded-full border ${diagBadge.cls}`}>
              {diagBadge.text}
            </span>
          )}
        </div>
        );
      })()}

      {/* 경고/에러 메시지 */}
      {display.warnings.length > 0 && (
        <ul className="text-xs text-amber-400/90 space-y-0.5">
          {display.warnings.map((w, i) => <li key={i} className="flex items-start gap-1"><span>⚡</span><span>{w}</span></li>)}
        </ul>
      )}
      {display.errors.length > 0 && (
        <ul className="text-xs text-red-400/90 space-y-0.5">
          {display.errors.map((e, i) => <li key={i} className="flex items-start gap-1"><span>🔴</span><span>{e}</span></li>)}
        </ul>
      )}

      {/* warm-up 결과 배너 */}
      {recheckResult && (
        <div className={`text-xs rounded-lg px-3 py-2 font-medium border ${
          recheckResult.resolved
            ? "bg-emerald-900/30 text-emerald-400 border-emerald-500/30"
            : "bg-amber-900/30 text-amber-400 border-amber-500/30"
        }`}>
          {recheckResult.resolved
            ? `✅ 재점검 후 정상 (${recheckResult.response_ms}ms, ${recheckResult.attempts}회)`
            : `⚠️ ${recheckResult.status} — 실제 장애 확인 필요`}
          {recheckResult.response_times.length > 1 && (
            <span className="ml-1 text-slate-500 font-mono text-[10px]">
              [{recheckResult.response_times.map(t => `${t}ms`).join("→")}]
            </span>
          )}
        </div>
      )}

      {/* 핵심 지표 — 고정 레이아웃 */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs border-t border-slate-700/50 pt-2">
        {commonMetrics.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-1">
            <dt className="text-slate-500">{label}</dt>
            <dd className={`font-medium tabular-nums ${val === "—" ? "text-slate-600" : "text-slate-300"}`}>{val}</dd>
          </div>
        ))}
        {extraMetric && (
          <div className="flex justify-between gap-1">
            <dt className="text-slate-500">{extraMetric[0]}</dt>
            <dd className={`font-medium tabular-nums ${extraMetric[1] === "—" ? "text-slate-600" : "text-slate-300"}`}>{extraMetric[1]}</dd>
          </div>
        )}
      </dl>

      {/* 조치 버튼 */}
      {needsAction && (
        <div className="flex flex-wrap gap-2 border-t border-slate-700/50 pt-2">
          {(hasSlowResponse(s) || hasHealthError(s)) && (
            <button
              onClick={handleWarmup}
              disabled={rechecking}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-200 disabled:opacity-50 font-medium transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${rechecking ? "animate-spin" : ""}`} />
              {rechecking ? "재점검 중…" : "Warm-up 재점검"}
            </button>
          )}
          {hasSslWarning(s) && (
            <button
              onClick={handleCopySsl}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-200 font-medium transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "복사됨 ✓" : "SSL 갱신 가이드"}
            </button>
          )}
          <button
            onClick={handleFix}
            disabled={fixing}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-violet-800 border border-violet-600 hover:bg-violet-700 text-violet-100 disabled:opacity-50 font-medium transition-colors"
          >
            <Wrench className={`w-3.5 h-3.5 ${fixing ? "animate-spin" : ""}`} />
            {fixing ? "AI 수정 지시 중…" : "AI 수정 지시"}
          </button>
        </div>
      )}

      {/* AI 수정 지시 결과 배너 */}
      {fixMsg && (
        <div className="text-xs rounded-lg px-3 py-2 font-medium border bg-violet-900/30 text-violet-300 border-violet-500/30">
          🤖 {fixMsg}
        </div>
      )}

      {/* 상세 페이지 링크 (지원 앱만) */}
      {(s.app_name === "Dart Link" || s.app_name === "Dart Monitor") && (
        <Link
          href={s.app_name === "Dart Link" ? "/dart-link" : "/dart-monitor"}
          className="flex items-center gap-1 text-[11px] text-sky-500 hover:text-sky-400 transition-colors mt-1"
        >
          <ExternalLink className="w-3 h-3" />
          상세 모니터링
        </Link>
      )}

      {/* 점검 시각 */}
      <p className="text-[10px] text-slate-600 mt-auto font-mono">점검 {checkedAt}</p>
    </div>
  );
}
