"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchStatus, fetchAvailability, triggerRun, AppStatus, RecheckResult, AvailabilityRow } from "@/lib/api";
import SortableCard from "@/components/SortableCard";
import { RefreshCw, Play, Zap, Bell, Timer } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay, DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import AppCard from "@/components/AppCard";

const REFRESH_INTERVAL = 60_000;
const AUTO_INTERVALS = [30, 60, 90, 120] as const;

export default function Dashboard() {
  const [statuses, setStatuses]           = useState<AppStatus[]>([]);
  const [order, setOrder]                 = useState<string[]>([]);  // app_name 순서
  const [draggingId, setDraggingId]       = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [availMap, setAvailMap]           = useState<Record<string, number>>({});
  const [loading, setLoading]             = useState(true);
  const [lastRefresh, setLastRefresh]     = useState<Date | null>(null);
  const [running, setRunning]             = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);
  const [autoMin, setAutoMin]             = useState<30 | 60 | 90 | 120>(30);
  const [autoActive, setAutoActive]       = useState(false);
  const [nextCheckIn, setNextCheckIn]     = useState<number | null>(null); // 초 카운트다운
  const autoTimerRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef                      = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, avail] = await Promise.all([
        fetchStatus(),
        fetchAvailability(7),
      ]);
      setStatuses(data);
      // 최초 로드 시에만 순서 초기화 (이후엔 드래그 순서 유지)
      setOrder(prev => {
        if (prev.length === 0) return data.map((d: AppStatus) => d.app_name);
        // 새로 추가된 앱은 뒤에 붙임
        const newNames = data.map((d: AppStatus) => d.app_name).filter((n: string) => !prev.includes(n));
        return [...prev.filter((n: string) => data.some((d: AppStatus) => d.app_name === n)), ...newNames];
      });
      const map: Record<string, number> = {};
      avail.forEach((r: AvailabilityRow) => { map[r.app_name] = r.availability; });
      setAvailMap(map);
      setLastRefresh(new Date());
    } catch {
      // 이력 없으면 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [load]);

  // 자동점검 시작/중지
  function startAuto() {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    const ms = autoMin * 60 * 1000;
    let remaining = autoMin * 60;
    setNextCheckIn(remaining);

    // 카운트다운 (1초마다)
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setNextCheckIn(remaining);
    }, 1000);

    // 점검 실행 (N분마다)
    autoTimerRef.current = setInterval(async () => {
      await triggerRun(false);
      setTimeout(load, 15000);
      remaining = autoMin * 60;
      setNextCheckIn(remaining);
    }, ms);

    setAutoActive(true);
  }

  function stopAuto() {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setAutoActive(false);
    setNextCheckIn(null);
  }

  function toggleAuto() {
    if (autoActive) stopAuto();
    else startAuto();
  }

  // autoMin 변경 시 실행 중이면 재시작
  function handleAutoMinChange(v: 30 | 60 | 90 | 120) {
    setAutoMin(v);
    if (autoActive) {
      stopAuto();
      // 새 값으로 즉시 재시작 (state 반영 전이므로 직접 계산)
      const ms = v * 60 * 1000;
      let remaining = v * 60;
      setNextCheckIn(remaining);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => { remaining -= 1; setNextCheckIn(remaining); }, 1000);
      if (autoTimerRef.current) clearInterval(autoTimerRef.current);
      autoTimerRef.current = setInterval(async () => {
        await triggerRun(false);
        setTimeout(load, 15000);
        remaining = v * 60;
        setNextCheckIn(remaining);
      }, ms);
      setAutoActive(true);
    }
  }

  // 언마운트 시 정리
  useEffect(() => () => { stopAuto(); }, []);

  async function handleRun(withSlack: boolean) {
    setRunning(true);
    setToast("🔍 점검 중… 약 15초 소요됩니다");
    try {
      await triggerRun(withSlack);
      await new Promise(resolve => setTimeout(resolve, 15000));
      const [freshData] = await Promise.all([fetchStatus(), fetchAvailability(7).then(avail => {
        const map: Record<string, number> = {};
        avail.forEach((r: AvailabilityRow) => { map[r.app_name] = r.availability; });
        setAvailMap(map);
      })]);
      setStatuses(freshData);
      setLastRefresh(new Date());

      const ok    = freshData.filter((s: AppStatus) => s.status === "ok").length;
      const warn  = freshData.filter((s: AppStatus) => s.status === "warn").length;
      const error = freshData.filter((s: AppStatus) => s.status === "error").length;
      const parts = [`✅ 정상 ${ok}개`];
      if (warn > 0)  parts.push(`⚠️ 경고 ${warn}개`);
      if (error > 0) parts.push(`🔴 오류 ${error}개`);
      const msg = `점검 완료 — ${parts.join(" · ")}`;
      setToast(withSlack ? msg + " · Slack 발송됨" : msg);
      setTimeout(() => setToast(null), 6000);
    } catch {
      setToast("⚠️ 점검 요청 실패 — 백엔드를 확인하세요");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setRunning(false);
    }
  }

  function handleRecheckDone(result: RecheckResult) {
    setStatuses(prev =>
      prev.map(s => s.app_name === result.app_name ? { ...s, ...result } : s)
    );
    const msg = result.resolved
      ? `✅ ${result.app_name} 재점검 후 정상 (${result.response_ms}ms)`
      : `⚠️ ${result.app_name} 재점검에도 ${result.status} — 실제 장애 확인 필요`;
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(e.active.id as string);
  }

  function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setOrder(prev => {
        const oldIdx = prev.indexOf(active.id as string);
        const newIdx = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  // order 기준으로 정렬된 statuses
  const sortedStatuses = order.length > 0
    ? [...statuses].sort((a, b) => order.indexOf(a.app_name) - order.indexOf(b.app_name))
    : statuses;

  const draggingStatus = draggingId ? statuses.find(s => s.app_name === draggingId) : null;

  const okCount    = statuses.filter(s => s.status === "ok").length;
  const warnCount  = statuses.filter(s => s.status === "warn").length;
  const errorCount = statuses.filter(s => s.status === "error").length;
  const totalCount = statuses.length;

  // 평균 응답속도
  const msList = statuses.map(s => s.response_ms).filter((v): v is number => v != null);
  const avgMs  = msList.length ? Math.round(msList.reduce((a, b) => a + b, 0) / msList.length) : null;

  // 전체 가용성 (availMap 평균)
  const availValues = Object.values(availMap);
  const avgAvail = availValues.length
    ? Math.round(availValues.reduce((a, b) => a + b, 0) / availValues.length)
    : null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">

      {/* 상단 헤더 바 */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <h1 className="text-base font-bold text-white tracking-tight">앱 관리 대시보드</h1>
            {lastRefresh && (
              <span className="text-xs text-slate-500 hidden sm:inline">
                {lastRefresh.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })} 기준
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* 자동점검 */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              autoActive
                ? "border-violet-500/60 bg-violet-900/30 text-violet-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}>
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <select
                value={autoMin}
                onChange={e => handleAutoMinChange(Number(e.target.value) as 30|60|90|120)}
                className="bg-transparent text-xs outline-none cursor-pointer"
              >
                {AUTO_INTERVALS.map(m => (
                  <option key={m} value={m} className="bg-slate-900">{m}분</option>
                ))}
              </select>
              <button
                onClick={toggleAuto}
                className={`ml-1 px-2 py-0.5 rounded font-medium text-[11px] transition-colors ${
                  autoActive
                    ? "bg-violet-600 hover:bg-violet-500 text-white"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                }`}
              >
                {autoActive ? "중지" : "시작"}
              </button>
              {autoActive && nextCheckIn != null && (
                <span className="text-[10px] text-violet-400 font-mono ml-1 shrink-0">
                  {Math.floor(nextCheckIn / 60)}:{String(nextCheckIn % 60).padStart(2, "0")}
                </span>
              )}
            </div>

            <button
              onClick={() => { setLoading(true); load(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              새로고침
            </button>
            <button
              onClick={() => handleRun(false)}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors font-medium"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? "점검 중…" : "즉시 점검"}
            </button>
            <button
              onClick={() => handleRun(true)}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors font-medium"
            >
              <Bell className="w-3.5 h-3.5" />
              슬랙 발송
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* 요약 지표 패널 (Grafana 스타일 stat panels) */}
        {totalCount > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 전체 앱 */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 font-medium">전체</p>
              <p className="text-3xl font-bold text-white tabular-nums">{totalCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">monitored apps</p>
            </div>
            {/* 정상 */}
            <div className="rounded-xl bg-slate-800/50 border border-emerald-500/20 px-4 py-3">
              <p className="text-[11px] text-emerald-400 uppercase tracking-wider mb-1 font-medium">정상</p>
              <p className="text-3xl font-bold text-emerald-400 tabular-nums">{okCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {warnCount > 0 && <span className="text-amber-400 mr-2">⚠ {warnCount}</span>}
                {errorCount > 0 && <span className="text-red-400">✗ {errorCount}</span>}
                {warnCount === 0 && errorCount === 0 && "all healthy"}
              </p>
            </div>
            {/* 평균 응답속도 */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 font-medium">평균 응답</p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: avgMs && avgMs > 3000 ? "#f59e0b" : "#6366f1" }}>
                {avgMs ?? "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">ms (현재 점검)</p>
            </div>
            {/* 7일 가용성 */}
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1 font-medium">7일 가용성</p>
              <p className="text-3xl font-bold tabular-nums" style={{ color: avgAvail == null ? "#64748b" : avgAvail >= 95 ? "#34d399" : avgAvail >= 80 ? "#fbbf24" : "#f87171" }}>
                {avgAvail != null ? `${avgAvail}%` : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">avg across apps</p>
            </div>
          </div>
        )}

        {/* 앱 카드 그리드 */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-slate-800/40 animate-pulse border border-slate-700/30" />
            ))}
          </div>
        ) : statuses.length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
              <Zap className="w-8 h-8 text-slate-500" />
            </div>
            <p className="text-slate-400 text-lg mb-1">점검 이력이 없습니다</p>
            <p className="text-slate-600 text-sm">위의 <strong className="text-slate-400">즉시 점검</strong> 버튼을 눌러 첫 점검을 실행하세요.</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedStatuses.map(s => (
                  <SortableCard
                    key={s.app_name}
                    s={s}
                    availability={availMap[s.app_name] ?? null}
                    onRecheckDone={handleRecheckDone}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {draggingStatus && (
                <div className="opacity-90 rotate-1 scale-105 shadow-2xl">
                  <AppCard
                    s={draggingStatus}
                    availability={availMap[draggingStatus.app_name] ?? null}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}

        {/* 푸터 */}
        <p className="text-center text-xs text-slate-700 pb-2">
          자동 갱신 60초 · {lastRefresh?.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) ?? "—"}
        </p>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-5 py-3 rounded-xl shadow-2xl z-50 max-w-md text-center transition-all ${
          toast.startsWith("🔍")
            ? "bg-indigo-900/90 border border-indigo-500/50 text-indigo-100"
            : toast.startsWith("⚠️")
            ? "bg-amber-900/90 border border-amber-500/50 text-amber-100"
            : toast.startsWith("점검 완료")
            ? "bg-slate-800/95 border border-emerald-500/40 text-slate-100"
            : "bg-slate-800 border border-slate-700 text-slate-100"
        }`}>
          {running && toast.startsWith("🔍") && (
            <span className="inline-block w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
          )}
          {toast}
        </div>
      )}
    </main>
  );
}
