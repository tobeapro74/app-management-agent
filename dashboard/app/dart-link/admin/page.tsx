"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, RefreshCw, Users, BarChart2, Activity,
  Database, TrendingUp, Building2, Shield, Phone,
  ChevronRight, Trophy, Eye, Layers,
} from "lucide-react";
import ArcGauge from "@/components/ArcGauge";
import SlideOver from "@/components/SlideOver";

const DART_API = "https://api.dartlinkpro.com";

// ── 타입 ──────────────────────────────────────────────────────────────────────
interface DashData {
  access: { dau: number; mau: number; dau_total: number; mau_total: number };
  page_views: {
    today: { path: string; count: number }[];
    week:  { path: string; count: number }[];
  };
  contacts: { today: number; week: number; month: number; last_month: number };
  account_opened_total: number;
  top_centers: { month: { center: string; count: number }[]; week: { center: string; count: number }[] };
  top_pbs:     { month: { pb: string; center: string; count: number }[]; week: { pb: string; center: string; count: number }[] };
  users: {
    total: number; approved: number; pending: number; rejected: number;
    by_center: { center: string; count: number }[];
    recent_pending: { name: string; position: string; center: string; created_at: string }[];
  };
  data: {
    company_total: number;
    fin_done: number; fin_missing: string[]; fin_missing_count: number;
    fin_missing_rejected: string[]; fin_rejected_count: number;
    ai_done: number; ai_month: number;
    ann_done: number; ann_summary_done: number; ann_missing: string[];
    opinion_rejected: number;
    pension_done: number;
    nps_matched: number;
    stability_dist: Record<string, number>;
    sector_dist: Record<string, number>;
  };
  phone: { total: number; missing: number; last_updated: string };
}

// ── 상수 ──────────────────────────────────────────────────────────────────────
const GRADE_ORDER  = ["우수", "양호", "보통", "주의", "위험"];
const GRADE_COLOR: Record<string, string> = {
  우수: "text-emerald-400", 양호: "text-sky-400",
  보통: "text-slate-300",   주의: "text-amber-400", 위험: "text-red-400",
};
const GRADE_BG: Record<string, string> = {
  우수: "bg-emerald-500", 양호: "bg-sky-500",
  보통: "bg-slate-500",   주의: "bg-amber-500", 위험: "bg-red-500",
};

const PAGE_LABEL: Record<string, string> = {
  "/":                  "홈",
  "/companies/상세":    "법인상세",
  "/companies":         "법인목록",
  "/top10":             "Top10",
  "/map":               "지도탐색",
  "/favorites":         "관심법인",
  "/contacts/register": "명함등록",
  "/contacts":          "접촉현황",
};

const RANK_STYLE = ["bg-yellow-600 text-yellow-100", "bg-slate-500 text-slate-100", "bg-amber-700 text-amber-100"];

// ── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, sub }: { icon: React.ElementType; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-sky-400 shrink-0" />
      <h2 className="text-sm font-semibold text-sky-400 uppercase tracking-wider">{title}</h2>
      {sub && <span className="text-[11px] text-slate-500 ml-1">{sub}</span>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900/70 border border-slate-800 rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}

function ProgressRow({ label, done, total, color = "#38bdf8" }: {
  label: string; done: number; total: number; color?: string;
}) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs font-mono text-slate-300">
          {done.toLocaleString("ko-KR")}
          <span className="text-slate-600"> / {total.toLocaleString("ko-KR")}</span>
          <span className="ml-1" style={{ color }}>{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function TabPills({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-slate-800/60 rounded-lg p-1">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
            active === t ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function DartLinkAdmin() {
  const router = useRouter();
  const [dash, setDash]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  // 슬라이드오버 상태
  const [slideOpen, setSlideOpen]   = useState(false);
  const [slideTitle, setSlideTitle] = useState("");
  const [slideContent, setSlideContent] = useState<React.ReactNode>(null);

  // 탭 상태
  const [accessTab, setAccessTab]   = useState("오늘");
  const [rankTab, setRankTab]       = useState("당월");
  const [pvTab, setPvTab]           = useState("오늘");

  const openSlide = useCallback((title: string, content: React.ReactNode) => {
    setSlideTitle(title);
    setSlideContent(content);
    setSlideOpen(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${DART_API}/api/admin/dashboard`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDash(data);
      }
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 60초 자동 새로고침
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !dash) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">관리자 데이터 로딩 중...</span>
        </div>
      </main>
    );
  }

  const d = dash!;
  const total = d.data.company_total;
  const pvList = pvTab === "오늘" ? d.page_views.today : d.page_views.week;
  const pvMax  = pvList[0]?.count ?? 1;
  const rankPbs     = rankTab === "당월" ? d.top_pbs.month     : d.top_pbs.week;
  const rankCenters = rankTab === "당월" ? d.top_centers.month : d.top_centers.week;
  const stabilityTotal = Object.values(d.data.stability_dist).reduce((a, b) => a + b, 0);

  // 접속자 현황 접속탭별 수치
  const accessMap: Record<string, { label: string; val: number; sub: string; color: string }> = {
    "오늘":  { label: "DAU", val: d.access.dau,  sub: `누적 ${d.access.dau_total.toLocaleString()}회`, color: "#22c55e" },
    "당월":  { label: "MAU", val: d.access.mau,  sub: `누적 ${d.access.mau_total.toLocaleString()}회`, color: "#38bdf8" },
  };
  const currentAccess = accessMap[accessTab] ?? accessMap["오늘"];

  // 슬라이드오버 — 센터별 사용자 분포
  const centerSlide = (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 mb-4">센터별 가입 현황 (승인 완료 기준)</p>
      {d.users.by_center.map((c, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-800/60">
          <span className="text-sm font-medium text-slate-200 flex-1">{c.center}</span>
          <span className="text-sm font-bold tabular-nums text-sky-400">{c.count}명</span>
        </div>
      ))}
      {d.users.by_center.length === 0 && (
        <p className="text-xs text-slate-500">데이터 없음</p>
      )}
    </div>
  );

  // 슬라이드오버 — Top PB 상세
  const pbSlide = (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 mb-4">접촉 횟수 기준 PB 순위 ({rankTab})</p>
      {rankPbs.map((pb, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 rounded-xl">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${RANK_STYLE[i] ?? "bg-slate-700 text-slate-300"}`}>
            {i + 1}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-100">{pb.pb}</p>
            <p className="text-[11px] text-slate-500">{pb.center}</p>
          </div>
          <span className="text-sm font-bold tabular-nums text-amber-400">{pb.count}건</span>
        </div>
      ))}
      {rankPbs.length === 0 && <p className="text-xs text-slate-500">데이터 없음</p>}
    </div>
  );

  // 슬라이드오버 — 재무 누락 기업
  const finMissingSlide = (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 mb-4">재무제표 미수집 기업 목록</p>
      {d.data.fin_missing.map((name, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 bg-amber-900/20 border border-amber-500/20 rounded-lg">
          <span className="text-[11px] text-amber-400 font-mono w-5 shrink-0">{i + 1}</span>
          <span className="text-sm text-amber-200">{name}</span>
        </div>
      ))}
      {d.data.fin_missing.length === 0 && <p className="text-xs text-slate-500">누락 없음</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dart-link")}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Dart Link
            </button>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
              <span className="font-bold text-slate-100 text-sm">관리자 대시보드</span>
              <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">admin@test.com</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {refreshedAt && (
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                {refreshedAt.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 기준
              </span>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ══ 게이지 히어로 ══ */}
        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* DAU */}
            <button
              onClick={() => openSlide("DAU — 오늘 접속자", centerSlide)}
              className="bg-slate-900/70 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 flex flex-col items-center gap-1 transition-colors group"
            >
              <ArcGauge
                value={Math.min(100, Math.round(d.access.dau / Math.max(d.access.mau, 1) * 100))}
                label="DAU"
                displayValue={d.access.dau.toLocaleString()}
                thresholds={[30, 10]}
                invert={true}
              />
              <p className="text-[10px] text-slate-500 mt-1">오늘 접속자</p>
              <p className="text-[10px] text-emerald-500/70 flex items-center gap-0.5 group-hover:text-emerald-400 transition-colors">
                명단 보기 <ChevronRight className="w-3 h-3" />
              </p>
            </button>

            {/* MAU */}
            <button
              onClick={() => openSlide("MAU — 이번달 접속자 (센터별)", centerSlide)}
              className="bg-slate-900/70 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-4 flex flex-col items-center gap-1 transition-colors group"
            >
              <ArcGauge
                value={Math.min(100, Math.round(d.access.mau / Math.max(d.users.total, 1) * 100))}
                label="MAU"
                displayValue={d.access.mau.toLocaleString()}
                thresholds={[30, 10]}
                invert={true}
              />
              <p className="text-[10px] text-slate-500 mt-1">이번달 접속자</p>
              <p className="text-[10px] text-sky-500/70 flex items-center gap-0.5 group-hover:text-sky-400 transition-colors">
                센터별 보기 <ChevronRight className="w-3 h-3" />
              </p>
            </button>

            {/* 재무제표 수집율 */}
            <button
              onClick={() => d.data.fin_missing_count > 0 && openSlide("재무제표 미수집 기업", finMissingSlide)}
              className="bg-slate-900/70 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 flex flex-col items-center gap-1 transition-colors group"
            >
              <ArcGauge
                value={total > 0 ? Math.round(d.data.fin_done / total * 100) : 0}
                label="재무제표"
                displayValue={`${total > 0 ? Math.round(d.data.fin_done / total * 100) : 0}%`}
                thresholds={[90, 70]}
                invert={true}
              />
              <p className="text-[10px] text-slate-500 mt-1">수집완료율</p>
              {d.data.fin_missing_count > 0 && (
                <p className="text-[10px] text-amber-500/70 flex items-center gap-0.5 group-hover:text-amber-400 transition-colors">
                  누락 {d.data.fin_missing_count}건 <ChevronRight className="w-3 h-3" />
                </p>
              )}
            </button>

            {/* 퇴직연금 분석율 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-1">
              <ArcGauge
                value={total > 0 ? Math.round(d.data.pension_done / total * 100) : 0}
                label="퇴직연금"
                displayValue={`${total > 0 ? Math.round(d.data.pension_done / total * 100) : 0}%`}
                thresholds={[90, 70]}
                invert={true}
              />
              <p className="text-[10px] text-slate-500 mt-1">AI분석완료율</p>
              <p className="text-[10px] text-slate-600">{d.data.pension_done.toLocaleString()}건</p>
            </div>

            {/* NPS 매칭율 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col items-center gap-1">
              <ArcGauge
                value={total > 0 ? Math.round(d.data.nps_matched / total * 100) : 0}
                label="NPS매칭"
                displayValue={`${total > 0 ? Math.round(d.data.nps_matched / total * 100) : 0}%`}
                thresholds={[90, 70]}
                invert={true}
              />
              <p className="text-[10px] text-slate-500 mt-1">종업원 매칭율</p>
              <p className="text-[10px] text-slate-600">{d.data.nps_matched.toLocaleString()}건</p>
            </div>

          </div>
        </section>

        {/* ══ §1 접속자 현황 + §2 기간별 접속현황 ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* 접속자 현황 — DAU/MAU */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <SectionHeader icon={Users} title="접속자 현황" />
              <TabPills tabs={["오늘", "당월"]} active={accessTab} onChange={setAccessTab} />
            </div>

            <div className="flex items-end gap-4 mb-5">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">{currentAccess.label}</p>
                <p className="text-4xl font-black tabular-nums" style={{ color: currentAccess.color }}>
                  {currentAccess.val.toLocaleString()}
                  <span className="text-base font-normal text-slate-500 ml-1">명</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-1">{currentAccess.sub}</p>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>전체 사용자 대비</span>
                  <span>{d.users.total}명</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, Math.round(currentAccess.val / Math.max(d.users.total, 1) * 100))}%`,
                      background: currentAccess.color,
                    }}
                  />
                </div>
                <p className="text-[11px]" style={{ color: currentAccess.color }}>
                  {Math.round(currentAccess.val / Math.max(d.users.total, 1) * 100)}% 접속
                </p>
              </div>
            </div>

            {/* 센터별 분포 */}
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">센터별 가입 현황</p>
              {d.users.by_center.slice(0, 5).map((c, i) => {
                const max = d.users.by_center[0]?.count ?? 1;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-28 truncate shrink-0">{c.center}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500/60" style={{ width: `${Math.round(c.count / max * 100)}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-slate-400 w-8 text-right">{c.count}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => openSlide("센터별 가입 현황 전체", centerSlide)}
              className="mt-3 w-full text-[11px] text-sky-500 hover:text-sky-400 flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              전체 {d.users.by_center.length}개 센터 보기 <ChevronRight className="w-3 h-3" />
            </button>
          </Card>

          {/* 기간별 접속현황 */}
          <Card>
            <SectionHeader icon={Activity} title="기간별 접속현황" />
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: "오늘", val: d.access.dau,  color: "#22c55e" },
                { label: "당월", val: d.access.mau,  color: "#38bdf8" },
                { label: "이번달 접촉", val: d.contacts.month, color: "#f59e0b" },
                { label: "전달 접촉",   val: d.contacts.last_month, color: "#94a3b8" },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40"
                  style={{ borderTopColor: color, borderTopWidth: 3 }}>
                  <p className="text-[11px] text-slate-500 mb-1">{label}</p>
                  <p className="text-2xl font-bold tabular-nums" style={{ color }}>{val.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* 승인 대기 */}
            {d.users.pending > 0 && (
              <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-3">
                <p className="text-xs text-amber-400 font-semibold mb-2">⚠ 승인 대기 {d.users.pending}명</p>
                {d.users.recent_pending.slice(0, 3).map((u, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-200/70 py-1">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-amber-500/50">·</span>
                    <span>{u.position}</span>
                    <span className="text-amber-500/50">·</span>
                    <span>{u.center}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 사용자 통계 */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "전체", val: d.users.total, color: "text-slate-200" },
                { label: "승인", val: d.users.approved, color: "text-emerald-400" },
                { label: "대기", val: d.users.pending, color: d.users.pending > 0 ? "text-amber-400" : "text-slate-500" },
                { label: "거절", val: d.users.rejected, color: "text-slate-500" },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-slate-800/40 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                  <p className={`text-lg font-bold tabular-nums ${color}`}>{val}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ══ §3 화면별 조회수 + §4 영업활동 순위 ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* 화면별 조회수 (3/5) */}
          <Card className="lg:col-span-3">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader icon={Eye} title="화면별 조회수" />
              <TabPills tabs={["오늘", "금주"]} active={pvTab} onChange={setPvTab} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {pvList.slice(0, 8).map(({ path, count }) => {
                const label = PAGE_LABEL[path] ?? path;
                const pct   = Math.round(count / pvMax * 100);
                return (
                  <div key={path} className="bg-slate-800/40 rounded-xl p-3 hover:bg-slate-800/70 transition-colors border border-slate-700/30 hover:border-sky-500/30">
                    <p className="text-[11px] text-slate-400 truncate mb-1.5">{label}</p>
                    <p className="text-xl font-bold tabular-nums text-slate-100">{count.toLocaleString()}</p>
                    <div className="h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
                      <div className="h-full rounded-full bg-sky-500/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between text-[11px] text-slate-500">
              <span>총 PV</span>
              <span className="font-mono text-slate-300">{pvList.reduce((s, r) => s + r.count, 0).toLocaleString()}회</span>
            </div>
          </Card>

          {/* 영업활동 순위 (2/5) */}
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <SectionHeader icon={Trophy} title="영업활동 순위" />
              <TabPills tabs={["당월", "금주"]} active={rankTab} onChange={setRankTab} />
            </div>

            {/* PB Top5 */}
            <div className="mb-4">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">접촉 최다 PB Top5</p>
              <div className="space-y-1.5">
                {rankPbs.slice(0, 5).map((pb, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-2 bg-slate-800/40 rounded-lg">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${RANK_STYLE[i] ?? "bg-slate-700 text-slate-400"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-100 truncate">{pb.pb}</p>
                      <p className="text-[10px] text-slate-500 truncate">{pb.center}</p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-amber-400 shrink-0">{pb.count}건</span>
                  </div>
                ))}
                {rankPbs.length === 0 && <p className="text-xs text-slate-500 py-2">데이터 없음</p>}
              </div>
              {rankPbs.length > 0 && (
                <button
                  onClick={() => openSlide(`접촉 최다 PB 순위 (${rankTab})`, pbSlide)}
                  className="mt-2 w-full text-[10px] text-sky-500 hover:text-sky-400 flex items-center justify-center gap-1 py-1 rounded hover:bg-slate-800/50 transition-colors"
                >
                  전체 보기 <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 센터 Top5 */}
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">접촉 최다 센터 Top5</p>
              <div className="space-y-1.5">
                {rankCenters.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-2 bg-slate-800/40 rounded-lg">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${RANK_STYLE[i] ?? "bg-slate-700 text-slate-400"}`}>
                      {i + 1}
                    </div>
                    <span className="flex-1 text-xs font-semibold text-slate-100 truncate">{c.center}</span>
                    <span className="text-xs font-bold tabular-nums text-amber-400 shrink-0">{c.count}건</span>
                  </div>
                ))}
                {rankCenters.length === 0 && <p className="text-xs text-slate-500 py-2">데이터 없음</p>}
              </div>
            </div>
          </Card>
        </div>

        {/* ══ §5 데이터 현황 ══ */}
        <Card>
          <SectionHeader icon={Database} title="데이터 현황" sub={`관리법인 ${total.toLocaleString()}개`} />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 mb-6">
            <ProgressRow label="재무제표 수집" done={d.data.fin_done} total={total} color="#38bdf8" />
            <ProgressRow label="AI 재무분석 완료" done={d.data.ai_done} total={total} color="#a78bfa" />
            <ProgressRow label="기업 주석 수집" done={d.data.ann_done} total={total} color="#22c55e" />
            <ProgressRow label="주석 AI 요약" done={d.data.ann_summary_done} total={total} color="#06b6d4" />
            <ProgressRow label="퇴직연금 AI 분석" done={d.data.pension_done} total={total} color="#22c55e" />
            <ProgressRow label="NPS 종업원 매칭" done={d.data.nps_matched} total={total} color="#f59e0b" />
          </div>

          {/* NPS 안정성 등급별 */}
          <div className="mb-5">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-3">NPS 안정성 등급 분포</p>
            <div className="flex gap-2">
              {GRADE_ORDER.map(grade => {
                const cnt = d.data.stability_dist[grade] ?? 0;
                const pct = stabilityTotal > 0 ? Math.round(cnt / stabilityTotal * 100) : 0;
                return (
                  <div key={grade} className="flex-1 bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700/30">
                    <span className={`inline-block w-2 h-2 rounded-full mb-1 ${GRADE_BG[grade]}`} />
                    <p className={`text-[11px] font-semibold ${GRADE_COLOR[grade]}`}>{grade}</p>
                    <p className="text-lg font-bold tabular-nums text-slate-100 mt-0.5">{cnt.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">{pct}%</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 경고 수치 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl p-3">
              <p className="text-[10px] text-amber-400 mb-1">재무제표 미수집</p>
              <p className="text-xl font-bold tabular-nums text-amber-300">{d.data.fin_missing_count}</p>
              <button
                onClick={() => d.data.fin_missing_count > 0 && openSlide("재무제표 미수집 기업", finMissingSlide)}
                className="text-[10px] text-amber-500/70 hover:text-amber-400 mt-1 flex items-center gap-0.5 transition-colors"
              >
                상세 <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="bg-red-900/20 border border-red-500/20 rounded-xl p-3">
              <p className="text-[10px] text-red-400 mb-1">감사의견 거절</p>
              <p className="text-xl font-bold tabular-nums text-red-300">{d.data.opinion_rejected}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 mb-1">전화번호 수집</p>
              <p className="text-xl font-bold tabular-nums text-slate-200">{d.phone?.total?.toLocaleString() ?? "—"}</p>
              <p className="text-[10px] text-slate-500 mt-1">{d.phone?.last_updated ?? ""}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 mb-1">관심법인 개설</p>
              <p className="text-xl font-bold tabular-nums text-violet-400">{d.account_opened_total.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* ══ §6 섹터별 분포 ══ */}
        <Card>
          <SectionHeader icon={Layers} title="섹터별 분포현황" sub={`15개 섹터 · 총 ${total.toLocaleString()}개 법인`} />
          <div className="space-y-2">
            {Object.entries(d.data.sector_dist)
              .sort(([, a], [, b]) => b - a)
              .map(([sector, cnt]) => {
                const maxCnt = Math.max(...Object.values(d.data.sector_dist));
                const pct = Math.round(cnt / maxCnt * 100);
                const totalPct = total > 0 ? ((cnt / total) * 100).toFixed(1) : "0";
                return (
                  <div key={sector} className="flex items-center gap-3">
                    <span className="text-[12px] text-slate-400 w-24 shrink-0">{sector}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: "linear-gradient(90deg, #38bdf8, #06b6d4)",
                        }}
                      />
                    </div>
                    <span className="text-[12px] font-bold tabular-nums text-slate-200 w-14 text-right">
                      {cnt.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-500 w-8 text-right">{totalPct}%</span>
                  </div>
                );
              })}
          </div>
        </Card>

        {/* ══ §7 데이터 수집 정책 + §8 모니터링·배치 ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <Card>
            <SectionHeader icon={Shield} title="데이터 수집 정책" />
            <div className="space-y-4">
              {[
                {
                  title: "📊 재무제표 일반",
                  rows: [
                    ["수집 주기", "연 1회 (사업보고서 제출 후)"],
                    ["수집 API", "DART opendart.fss.or.kr"],
                    ["수집 항목", "손익·재무·현금흐름 3종"],
                    ["단위", "원 단위 저장"],
                    ["Rate Limit", "10,000건/일 (IP 차단 주의)"],
                  ],
                },
                {
                  title: "🏦 퇴직연금 기업",
                  rows: [
                    ["수집 주기", "연 1회 (주석 파싱)"],
                    ["파싱 로직", "fetch_annotations.py"],
                    ["핵심 로직", "P/TD 태그 분리 (2026-07-30)"],
                    ["AI 분석", "claude-haiku-4-5 · 병렬 20workers"],
                    ["저장 테이블", "company_annotations · ai_analyses"],
                  ],
                },
              ].map(({ title, rows }) => (
                <div key={title} className="bg-slate-800/40 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-200 mb-3">{title}</p>
                  <div className="space-y-1.5">
                    {rows.map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs border-b border-slate-700/30 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-slate-500">{k}</span>
                        <span className="text-slate-300 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader icon={Activity} title="모니터링 및 배치 기준" />
            <div className="space-y-2">
              {[
                { dot: "bg-emerald-400", name: "헬스 체크", sub: "8개 앱 · APScheduler", time: "09:00 / 18:00 KST", status: "자동", ok: true },
                { dot: "bg-emerald-400", name: "Slack 알림",   sub: "이상 감지 시 즉시",           time: "실시간",        status: "활성", ok: true },
                { dot: "bg-emerald-400", name: "재무제표 수집", sub: "DART API · 4월 시즌",       time: "연 1회",        status: "완료", ok: true },
                { dot: "bg-emerald-400", name: "주석 파싱",    sub: "fetch_annotations.py",     time: "연 1회",        status: "완료", ok: true },
                { dot: "bg-emerald-400", name: "퇴직연금 AI분석", sub: "병렬 20workers",          time: "2026-07-30",   status: "완료", ok: true },
                { dot: "bg-amber-400",  name: "NPS 종업원 매칭", sub: "분기 업데이트",            time: "분기 1회",      status: "Q3예정", ok: false },
                { dot: "bg-amber-400",  name: "전화번호 수집",  sub: "외부 소스 크롤링",          time: "월 1회",        status: d.phone?.last_updated ?? "—", ok: false },
                { dot: "bg-emerald-400", name: "SSL 인증서 감시", sub: "30일 이하 시 Slack 경보", time: "매일 09:00",    status: "정상", ok: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/40 rounded-xl">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${item.dot} ${item.ok ? "shadow-[0_0_4px_currentColor]" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-500">{item.sub}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{item.time}</span>
                  <span className={`text-[10px] font-semibold shrink-0 ${item.ok ? "text-emerald-400" : "text-amber-400"}`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ══ §9 가입자 현황 ══ */}
        <Card>
          <SectionHeader icon={Building2} title="가입자 현황" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "누적 가입자", val: d.users.total, color: "text-slate-100", sub: "전체" },
              { label: "승인 완료", val: d.users.approved, color: "text-emerald-400", sub: "활성" },
              { label: "승인 대기", val: d.users.pending, color: d.users.pending > 0 ? "text-amber-400" : "text-slate-500", sub: "검토 필요" },
              { label: "등록 법인", val: d.data.company_total, color: "text-sky-400", sub: "총 외감법인" },
              { label: "AI 분석 완료", val: d.data.ai_done, color: "text-violet-400", sub: `이번달 ${d.data.ai_month}건` },
              { label: "관심법인 개설", val: d.account_opened_total, color: "text-pink-400", sub: "누적" },
            ].map(({ label, val, color, sub }) => (
              <div key={label} className="bg-slate-800/50 border border-slate-700/40 rounded-xl px-4 py-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                <p className={`text-2xl font-bold tabular-nums ${color}`}>{val.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </Card>

      </div>

      {/* ── 슬라이드오버 ── */}
      <SlideOver open={slideOpen} onClose={() => setSlideOpen(false)} title={slideTitle}>
        {slideContent}
      </SlideOver>

    </main>
  );
}
