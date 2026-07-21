"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import {
  ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, XCircle,
  Database, Cpu, Shield, BarChart2, Building2, Users, Eye,
  Phone, FileText, TrendingUp, Star,
} from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface DashData {
  access: { dau: number; mau: number; dau_total: number; mau_total: number };
  page_views: { today: { path: string; count: number }[]; week: { path: string; count: number }[] };
  contacts: { today: number; week: number; month: number; last_month: number };
  account_opened_total: number;
  users: { total: number; approved: number; pending: number; rejected: number };
  data: {
    company_total: number;
    fin_done: number;
    fin_missing: string[];
    fin_missing_count: number;
    ai_done: number;
    ai_month: number;
    ann_done: number;
    stability_dist: Record<string, number>;
    sector_dist: Record<string, number>;
    opinion_rejected: number;
    nps_matched: number;
  };
  phone: { total: number; missing: number; last_updated: string };
}

interface HealthData {
  status: string;
  response_ms: number | null;
  details: {
    ssl_days?: number;
    disclosure_found?: number;
    financial_ok?: number;
    ai_ok?: number;
  };
}

interface DisclosureData {
  date: string;
  found: number;
  financial_ok: number;
  ai_ok: number;
  companies: {
    corp_name: string;
    stability_grade: string;
    report_nm: string;
    year: string;
    company_id: number;
  }[];
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────
const GRADE_COLOR: Record<string, string> = {
  "우수": "text-emerald-400", "양호": "text-sky-400",
  "보통": "text-slate-300",   "주의": "text-amber-400", "위험": "text-red-400",
};
const GRADE_DOT: Record<string, string> = {
  "우수": "bg-emerald-400", "양호": "bg-sky-400",
  "보통": "bg-slate-400",   "주의": "bg-amber-400", "위험": "bg-red-400",
};

function StatusIcon({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (warn) return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
  return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
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

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-sky-400" />
      <h2 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{title}</h2>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────
export default function DartLinkDetail() {
  const router = useRouter();
  const [dash, setDash]         = useState<DashData | null>(null);
  const [health, setHealth]     = useState<HealthData | null>(null);
  const [disc, setDisc]         = useState<DisclosureData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    try {
      const DART_API = "https://api.dartlinkpro.com";
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayStr = today.toISOString().slice(0, 10).replace(/-/g, "");

      const [dashRes, discRes, agentStatus] = await Promise.allSettled([
        fetch(`${DART_API}/api/admin/dashboard`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${DART_API}/api/admin/disclosure-results?date=${todayStr}`, { cache: "no-store" }).then(r => r.json()),
        fetch(`${API_BASE}/api/status`, { cache: "no-store" }).then(r => r.json()),
      ]);

      if (dashRes.status === "fulfilled") setDash(dashRes.value);
      if (discRes.status === "fulfilled") setDisc(discRes.value);
      if (agentStatus.status === "fulfilled") {
        const arr: HealthData[] = agentStatus.value;
        const dl = arr.find((s: HealthData & { app_name?: string }) =>
          (s as { app_name?: string }).app_name === "Dart Link"
        );
        if (dl) setHealth(dl as HealthData);
      }

      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── 점검 항목 평가 ──
  const checks = dash ? [
    {
      id: "D01", name: "오늘 신규 공시 수집",
      ok: (disc?.found ?? 0) > 0,
      warn: (disc?.found ?? 0) === 0,
      detail: disc ? (disc.found > 0 ? `${disc.found}건 수집 완료` : "0건 — DART API 또는 스케줄러 확인 필요") : "—",
    },
    {
      id: "D02", name: "API 서버 상태",
      ok: health?.status === "ok",
      warn: false,
      detail: health
        ? `${health.status === "ok" ? "정상" : health.status} · ${health.response_ms ?? "—"}ms`
        : "—",
    },
    {
      id: "D03", name: "재무데이터 누락 기업",
      ok: dash.data.fin_missing_count === 0,
      warn: dash.data.fin_missing_count > 0 && dash.data.fin_missing_count <= 10,
      detail: dash.data.fin_missing_count === 0
        ? "없음"
        : `${dash.data.fin_missing_count}개사 — ${dash.data.fin_missing.slice(0, 3).join(", ")}${dash.data.fin_missing.length > 3 ? " 외" : ""}`,
    },
    {
      id: "D04", name: "AI 분석 미완료",
      ok: dash.data.ai_done >= dash.data.company_total - dash.data.opinion_rejected,
      warn: false,
      detail: `완료 ${dash.data.ai_done.toLocaleString("ko-KR")}건 · 이번달 신규 ${dash.data.ai_month}건`,
    },
    {
      id: "D05", name: "SSL 인증서",
      ok: (health?.details?.ssl_days ?? 999) >= 30,
      warn: (health?.details?.ssl_days ?? 999) < 30 && (health?.details?.ssl_days ?? 999) >= 14,
      detail: health?.details?.ssl_days != null ? `${health.details.ssl_days}일 남음` : "—",
    },
    {
      id: "D06", name: "사용자 승인 대기",
      ok: dash.users.pending === 0,
      warn: dash.users.pending > 0,
      detail: dash.users.pending === 0 ? "없음" : `${dash.users.pending}명 대기 중`,
    },
  ] : [];

  const okCnt   = checks.filter(c => c.ok).length;
  const warnCnt = checks.filter(c => !c.ok && c.warn).length;
  const errCnt  = checks.filter(c => !c.ok && !c.warn).length;

  const todayPv = dash?.page_views.today.reduce((s, r) => s + r.count, 0) ?? 0;
  const weekPv  = dash?.page_views.week.reduce((s, r) => s + r.count, 0) ?? 0;

  // 안정성 등급 분포 정렬
  const GRADE_ORDER = ["우수", "양호", "보통", "주의", "위험"];
  const stabilityTotal = dash ? Object.values(dash.data.stability_dist).reduce((a, b) => a + b, 0) : 0;

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
              <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
              <span className="font-semibold text-slate-100 text-sm">Dart Link</span>
              <span className="text-[10px] text-slate-500 font-mono">NH투자증권 법인영업</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {refreshedAt && (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {refreshedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 기준
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {loading && !dash ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-slate-800/40 animate-pulse border border-slate-700/30" />
            ))}
          </div>
        ) : (
          <>

            {/* ── 시스템 점검 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={Shield} title="시스템 점검" />

              {/* 요약 배지 */}
              <div className="flex items-center gap-2 mb-4 text-xs">
                <span className="text-slate-500">총 {checks.length}개 항목</span>
                {okCnt > 0   && <span className="px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-500/30">✅ 정상 {okCnt}</span>}
                {warnCnt > 0 && <span className="px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-500/30">⚠️ 경고 {warnCnt}</span>}
                {errCnt > 0  && <span className="px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-500/30">❌ 오류 {errCnt}</span>}
              </div>

              <div className="divide-y divide-slate-800">
                {checks.map(c => (
                  <div key={c.id} className="flex items-start gap-3 py-2.5">
                    <StatusIcon ok={c.ok} warn={c.warn} />
                    <span className="text-[11px] font-mono text-slate-500 w-8 shrink-0 pt-0.5">{c.id}</span>
                    <span className="text-sm text-slate-300 w-36 shrink-0">{c.name}</span>
                    <span className={`text-sm ${c.ok ? "text-emerald-400" : c.warn ? "text-amber-400" : "text-red-400"}`}>
                      {c.detail}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 운영 현황 요약 ── */}
            <section>
              <SectionTitle icon={BarChart2} title="운영 현황" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="등록 기업" value={dash?.data.company_total ?? 0} sub="총 외감법인" color="text-sky-400" />
                <StatCard label="오늘 페이지뷰" value={todayPv} sub={`주간 ${weekPv.toLocaleString("ko-KR")}회`} />
                <StatCard label="DAU (접속자)" value={dash?.access.dau ?? 0} sub={`누적 ${(dash?.access.dau_total ?? 0).toLocaleString("ko-KR")}회`} />
                <StatCard label="관심법인 개설" value={dash?.account_opened_total ?? 0} sub="전체 누적" color="text-violet-400" />
              </div>
            </section>

            {/* ── 오늘 공시 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={FileText} title="오늘 공시 수집" />
              {disc && disc.found > 0 ? (
                <>
                  <div className="flex gap-4 text-sm mb-4">
                    <span className="text-slate-400">공시 <strong className="text-sky-400">{disc.found}건</strong></span>
                    <span className="text-slate-400">재무수집 <strong className="text-emerald-400">{disc.financial_ok}건</strong></span>
                    <span className="text-slate-400">AI분석 <strong className="text-violet-400">{disc.ai_ok}건</strong></span>
                  </div>
                  <div className="space-y-2">
                    {disc.companies.map((c, i) => (
                      <a
                        key={i}
                        href={`https://dart-link.vercel.app/companies/${c.company_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${GRADE_DOT[c.stability_grade] ?? "bg-slate-500"}`} />
                        <span className="text-sm text-slate-200 font-medium">{c.corp_name}</span>
                        <span className={`text-xs ${GRADE_COLOR[c.stability_grade] ?? "text-slate-400"}`}>{c.stability_grade}</span>
                        <span className="text-xs text-slate-500 ml-auto">{c.year}년 {c.report_nm}</span>
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500 py-2">오늘 신규 공시 없음</p>
              )}
            </section>

            {/* ── 데이터 품질 + 인기 경로 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 데이터 품질 */}
              <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <SectionTitle icon={Database} title="데이터 품질" />
                <div className="space-y-3 text-sm">
                  {[
                    { label: "재무데이터 완료", done: dash?.data.fin_done ?? 0, total: dash?.data.company_total ?? 0 },
                    { label: "AI 분석 완료",    done: dash?.data.ai_done ?? 0,  total: dash?.data.company_total ?? 0 },
                    { label: "기업 주석 완료",  done: dash?.data.ann_done ?? 0, total: dash?.data.company_total ?? 0 },
                    { label: "NPS 매칭",        done: dash?.data.nps_matched ?? 0, total: dash?.data.company_total ?? 0 },
                  ].map(({ label, done, total }) => {
                    const pct = total ? Math.round(done / total * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-400">{label}</span>
                          <span className="font-mono text-slate-300">
                            {done.toLocaleString("ko-KR")} <span className="text-slate-600">/ {total.toLocaleString("ko-KR")}</span>
                            <span className="text-sky-400 ml-1">{pct}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: pct >= 99 ? "#34d399" : pct >= 90 ? "#38bdf8" : "#f59e0b"
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 재무 누락 기업 목록 */}
                {(dash?.data.fin_missing?.length ?? 0) > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-800">
                    <p className="text-[11px] text-amber-400 mb-1">⚠️ 재무 누락 기업</p>
                    <div className="flex flex-wrap gap-1">
                      {dash!.data.fin_missing.map(name => (
                        <span key={name} className="text-[11px] px-2 py-0.5 rounded bg-amber-900/30 text-amber-300 border border-amber-500/20">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* 인기 페이지 + 접촉이력 */}
              <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <SectionTitle icon={Eye} title="오늘 인기 경로" />
                <div className="space-y-2 mb-5">
                  {(dash?.page_views.today ?? []).slice(0, 6).map(({ path, count }) => {
                    const maxCount = dash?.page_views.today[0]?.count ?? 1;
                    return (
                      <div key={path} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 w-36 truncate">{path}</span>
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-500/60 rounded-full" style={{ width: `${Math.round(count / maxCount * 100)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-400 w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>

                <SectionTitle icon={Phone} title="접촉이력" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "오늘", value: dash?.contacts.today ?? 0 },
                    { label: "이번주", value: dash?.contacts.week ?? 0 },
                    { label: "이번달", value: dash?.contacts.month ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-800/50 rounded-lg py-2">
                      <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                      <p className="text-lg font-bold tabular-nums text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* ── 안정성 등급 분포 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={TrendingUp} title="재무 안정성 등급 분포" />
              <div className="flex gap-3 flex-wrap">
                {GRADE_ORDER.map(grade => {
                  const cnt = dash?.data.stability_dist[grade] ?? 0;
                  const pct = stabilityTotal ? Math.round(cnt / stabilityTotal * 100) : 0;
                  return (
                    <div key={grade} className="flex-1 min-w-[80px] bg-slate-800/50 rounded-xl p-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full mb-1 ${GRADE_DOT[grade]}`} />
                      <p className={`text-xs font-medium ${GRADE_COLOR[grade]}`}>{grade}</p>
                      <p className="text-lg font-bold tabular-nums text-slate-200 mt-0.5">{cnt.toLocaleString("ko-KR")}</p>
                      <p className="text-[10px] text-slate-500">{pct}%</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── 사용자 현황 ── */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <SectionTitle icon={Users} title="사용자 현황" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="전체 사용자" value={dash?.users.total ?? 0} color="text-slate-200" />
                <StatCard label="승인 완료" value={dash?.users.approved ?? 0} color="text-emerald-400" />
                <StatCard label="승인 대기" value={dash?.users.pending ?? 0}
                  color={(dash?.users.pending ?? 0) > 0 ? "text-amber-400" : "text-slate-500"} />
                <StatCard label="거절" value={dash?.users.rejected ?? 0} color="text-slate-500" />
              </div>
            </section>

          </>
        )}
      </div>
    </main>
  );
}
