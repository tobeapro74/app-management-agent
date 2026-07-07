"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, XCircle, Info,
  Database, Cpu, BarChart2, TrendingUp, Users, Eye, FileText,
} from "lucide-react";

const DM_PROXY = "/api/dart-monitor-proxy";

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface HealthData {
  status: string;
  checks: { db: string; dart_collector: string };
  last_poll_at: string;
  disclosures_total: number;
  total_members: number;
  dau_yesterday: number;
  new_members_yesterday: number;
}

interface DailyCount { date: string; count: number }
interface TopImpactItem {
  corp_name: string; report_nm: string; tier: number;
  direction: string; category_name: string; rcept_dt: string;
  rcept_no: string; corp_code: string;
}

interface AllData {
  health: HealthData | null;
  dailyCounts: DailyCount[];   // 최근 7일 공시 수
  todayImpact: TopImpactItem[]; // 오늘 주요 공시
  weekImpact: TopImpactItem[];  // 주간 주요 공시
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const DIRECTION_COLOR: Record<string, string> = {
  UP:      "text-emerald-400",
  DOWN:    "text-red-400",
  NEUTRAL: "text-slate-400",
};
const DIRECTION_LABEL: Record<string, string> = { UP: "호재", DOWN: "악재", NEUTRAL: "중립" };
const TIER_COLOR = ["", "text-red-400", "text-amber-400", "text-sky-400"];

function StatusIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok)   return <CheckCircle   className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (warn) return <AlertTriangle className="w-4 h-4 text-amber-400  shrink-0" />;
  return      <XCircle            className="w-4 h-4 text-red-400    shrink-0" />;
}

function SectionTitle({ icon: Icon, title, accent = "text-orange-400" }: {
  icon: React.ElementType; title: string; accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={`w-4 h-4 ${accent}`} />
      <h2 className={`text-sm font-semibold uppercase tracking-wider ${accent}`}>{title}</h2>
    </div>
  );
}

function StatCard({ label, value, sub, color = "text-white" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>
        {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function DartMonitorDetail() {
  const router = useRouter();
  const [mode, setMode]         = useState<"daily" | "weekly">("daily");
  const [data, setData]         = useState<AllData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [healthRes, dailyRes, todayRes, weekRes] = await Promise.allSettled([
        fetch(`${DM_PROXY}?path=health`,                                              { cache: "no-store" }).then(r => r.json()),
        fetch(`${DM_PROXY}?path=stats/daily&period=week`,                             { cache: "no-store" }).then(r => r.json()),
        fetch(`${DM_PROXY}?path=stats/top-impact&period=today&limit=10`,              { cache: "no-store" }).then(r => r.json()),
        fetch(`${DM_PROXY}?path=stats/top-impact&period=week&limit=10`,               { cache: "no-store" }).then(r => r.json()),
      ]);

      setData({
        health:      healthRes.status === "fulfilled" ? healthRes.value : null,
        dailyCounts: dailyRes.status  === "fulfilled" ? (dailyRes.value.items ?? []) : [],
        todayImpact: todayRes.status  === "fulfilled" ? (todayRes.value.items ?? []) : [],
        weekImpact:  weekRes.status   === "fulfilled" ? (weekRes.value.items  ?? []) : [],
      });
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── 시스템 점검 항목 계산 ──
  const h = data?.health;
  const todayStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const todayCnt = data?.dailyCounts.find(d => d.date === todayStr)?.count ?? 0;
  const weekTotal = data?.dailyCounts.reduce((s, d) => s + d.count, 0) ?? 0;

  const lastPollAt = h?.last_poll_at
    ? new Date(h.last_poll_at.endsWith("Z") || h.last_poll_at.includes("+") ? h.last_poll_at : h.last_poll_at + "+09:00")
    : null;
  const pollMinAgo = lastPollAt
    ? Math.floor((Date.now() - lastPollAt.getTime()) / 60000)
    : null;
  const pollOk  = pollMinAgo != null && pollMinAgo < 120;
  const pollWarn = pollMinAgo != null && pollMinAgo >= 120 && pollMinAgo < 360;

  const dailyChecks = [
    {
      id: "D01", name: "DART 공시 폴링",
      ok: todayCnt > 0, warn: todayCnt === 0,
      detail: todayCnt > 0 ? `오늘 ${todayCnt.toLocaleString("ko-KR")}건` : "오늘 0건",
      note: todayCnt === 0 ? "장 마감 전이거나 폴링 지연" : "",
    },
    {
      id: "D02", name: "수집기 상태",
      ok: h?.checks.dart_collector === "ok", warn: false,
      detail: h?.checks.dart_collector === "ok" ? "정상" : (h?.checks.dart_collector ?? "확인 불가"),
      note: "",
    },
    {
      id: "D03", name: "DB 연결",
      ok: h?.checks.db === "ok", warn: false,
      detail: h?.checks.db === "ok" ? "정상" : (h?.checks.db ?? "확인 불가"),
      note: "",
    },
    {
      id: "D04", name: "최근 공시 수집",
      ok: pollOk, warn: pollWarn,
      detail: pollMinAgo != null
        ? pollMinAgo < 60
          ? `${pollMinAgo}분 전`
          : `${Math.floor(pollMinAgo / 60)}시간 ${pollMinAgo % 60}분 전`
        : "확인 불가",
      note: !pollOk && !pollWarn ? "6시간 이상 미수집 — 스케줄러 확인 필요" : "",
    },
    {
      id: "D05", name: "누적 공시",
      ok: (h?.disclosures_total ?? 0) > 300000, warn: false,
      detail: `${(h?.disclosures_total ?? 0).toLocaleString("ko-KR")}건`,
      note: "",
    },
  ];

  const weeklyChecks = [
    {
      id: "W01", name: "주간 공시 수집",
      ok: weekTotal > 0, warn: weekTotal === 0,
      detail: `${weekTotal.toLocaleString("ko-KR")}건 (${data?.dailyCounts.length ?? 0}일치)`,
      note: "",
    },
    {
      id: "W02", name: "수집기 상태",
      ok: h?.checks.dart_collector === "ok", warn: false,
      detail: h?.checks.dart_collector === "ok" ? "정상" : (h?.checks.dart_collector ?? "확인 불가"),
      note: "",
    },
    {
      id: "W03", name: "DB 연결",
      ok: h?.checks.db === "ok", warn: false,
      detail: h?.checks.db === "ok" ? "정상" : (h?.checks.db ?? "확인 불가"),
      note: "",
    },
    {
      id: "W04", name: "최근 공시 수집",
      ok: pollOk, warn: pollWarn,
      detail: pollMinAgo != null
        ? pollMinAgo < 60
          ? `${pollMinAgo}분 전`
          : `${Math.floor(pollMinAgo / 60)}시간 ${pollMinAgo % 60}분 전`
        : "확인 불가",
      note: !pollOk && !pollWarn ? "6시간 이상 미수집" : "",
    },
  ];

  const checks = mode === "daily" ? dailyChecks : weeklyChecks;
  const okCnt   = checks.filter(c => c.ok).length;
  const warnCnt = checks.filter(c => !c.ok && c.warn).length;
  const errCnt  = checks.filter(c => !c.ok && !c.warn).length;

  const impactList = mode === "daily" ? data?.todayImpact : data?.weekImpact;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">

      {/* 헤더 */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              대시보드
            </button>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_6px_#fb923c]" />
              <span className="font-semibold text-slate-100 text-sm">Dart Monitor</span>
              <span className="text-[10px] text-slate-500 font-mono">DART 공시 모니터링</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
              {(["daily", "weekly"] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 transition-colors ${
                    mode === m ? "bg-orange-600 text-white font-medium" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                  }`}>
                  {m === "daily" ? "일간" : "주간"}
                </button>
              ))}
            </div>
            {refreshedAt && (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {refreshedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 기준
              </span>
            )}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {loading && !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl bg-slate-800/40 animate-pulse border border-slate-700/30" />
            ))}
          </div>
        ) : (
          <>
            {/* ── 운영 요약 ── */}
            <section>
              <SectionTitle icon={BarChart2} title="운영 현황" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="누적 공시" value={h?.disclosures_total ?? 0} color="text-orange-400"
                  sub="전체 수집 건수" />
                <StatCard label="오늘 공시" value={todayCnt}
                  color={todayCnt > 0 ? "text-emerald-400" : "text-slate-500"} sub="장중 수집분 포함" />
                <StatCard label="주간 공시" value={weekTotal} sub={`${data?.dailyCounts.length ?? 0}일치`} />
                <StatCard label="전체 회원" value={h?.total_members ?? 0} color="text-violet-400"
                  sub={`전일DAU ${h?.dau_yesterday ?? 0}명`} />
              </div>
            </section>

            {/* ── 시스템 점검 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={Cpu} title={`${mode === "daily" ? "일간" : "주간"} 시스템 점검`} />
              <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
                <span className="text-slate-500">총 {checks.length}개 항목</span>
                {okCnt > 0   && <span className="px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">✅ 정상 {okCnt}</span>}
                {warnCnt > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-900/40  text-amber-400  border border-amber-500/30" >⚠️ 경고 {warnCnt}</span>}
                {errCnt > 0  && <span className="px-2 py-0.5 rounded-full bg-red-900/40    text-red-400    border border-red-500/30"   >❌ 오류 {errCnt}</span>}
                {errCnt === 0 && warnCnt === 0 && <span className="px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">전체 정상</span>}
              </div>
              <div className="divide-y divide-slate-800">
                {checks.map(c => (
                  <div key={c.id} className="flex items-start gap-3 py-3">
                    <StatusIcon ok={c.ok} warn={c.warn} />
                    <span className="text-[11px] font-mono text-slate-500 w-8 shrink-0 pt-0.5">{c.id}</span>
                    <div className="flex-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <span className="text-sm text-slate-300 shrink-0">{c.name}</span>
                        <span className={`text-sm font-medium ${c.ok ? "text-emerald-400" : c.warn ? "text-amber-400" : "text-red-400"}`}>
                          {c.detail}
                        </span>
                      </div>
                      {c.note && <p className="text-[11px] text-slate-500 mt-0.5">{c.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 주요 공시 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={FileText} title={`${mode === "daily" ? "오늘" : "주간"} 주요 공시 (Tier 1~2)`} />
              {(impactList?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {impactList!.map((item, i) => (
                    <a key={i}
                      href={`https://dart-monitor.vercel.app/companies/${item.corp_code}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                    >
                      <span className={`text-[10px] font-bold mt-0.5 shrink-0 ${TIER_COLOR[item.tier] ?? "text-slate-400"}`}>
                        T{item.tier}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-200">{item.corp_name}</span>
                          <span className={`text-[11px] font-medium ${DIRECTION_COLOR[item.direction] ?? "text-slate-400"}`}>
                            {DIRECTION_LABEL[item.direction] ?? item.direction}
                          </span>
                          <span className="text-[11px] text-slate-500">{item.category_name}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{item.report_nm}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 shrink-0">{item.rcept_dt}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-2">
                  {mode === "daily" ? "오늘 Tier 1~2 공시 없음" : "이번 주 Tier 1~2 공시 없음"}
                </p>
              )}
            </section>

            {/* ── 일별 공시 추이 ── */}
            {(data?.dailyCounts.length ?? 0) > 0 && (
              <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <SectionTitle icon={TrendingUp} title="최근 7일 공시 추이" />
                <div className="space-y-2">
                  {[...(data?.dailyCounts ?? [])].reverse().map(({ date, count }) => {
                    const maxCnt = Math.max(...(data?.dailyCounts.map(d => d.count) ?? [1]));
                    const pct = Math.round(count / maxCnt * 100);
                    const isToday = date === todayStr;
                    return (
                      <div key={date} className="flex items-center gap-3">
                        <span className={`text-[11px] font-mono w-24 shrink-0 ${isToday ? "text-orange-400" : "text-slate-500"}`}>
                          {date.slice(5)} {isToday ? "오늘" : ""}
                        </span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: isToday ? "#fb923c" : "#38bdf8" }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-400 w-16 text-right">
                          {count.toLocaleString("ko-KR")}건
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── 사용자 현황 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={Users} title="사용자 현황" />
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">전체 회원</p>
                  <p className="text-xl font-bold text-slate-200">{(h?.total_members ?? 0).toLocaleString("ko-KR")}</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">전일 DAU</p>
                  <p className="text-xl font-bold text-slate-200">{(h?.dau_yesterday ?? 0).toLocaleString("ko-KR")}</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">전일 신규가입</p>
                  <p className="text-xl font-bold text-slate-200">{(h?.new_members_yesterday ?? 0).toLocaleString("ko-KR")}</p>
                </div>
              </div>
            </section>

            <p className="text-center text-xs text-slate-700 pb-2 font-mono">
              api.dart-monitor.com · {refreshedAt?.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) ?? "—"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
