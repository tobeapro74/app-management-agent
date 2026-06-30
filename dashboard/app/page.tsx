"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchStatus, fetchAvailability, triggerRun, AppStatus, RecheckResult, AvailabilityRow } from "@/lib/api";
import AppCard from "@/components/AppCard";
import { RefreshCw, Play } from "lucide-react";

const REFRESH_INTERVAL = 60_000;

export default function Dashboard() {
  const [statuses, setStatuses]       = useState<AppStatus[]>([]);
  const [availMap, setAvailMap]       = useState<Record<string, number>>({});
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [running, setRunning]         = useState(false);
  const [toast, setToast]             = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, avail] = await Promise.all([
        fetchStatus(),
        fetchAvailability(7),
      ]);
      setStatuses(data);
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

  async function handleRun(withSlack: boolean) {
    setRunning(true);
    try {
      const res = await triggerRun(withSlack);
      setToast(res.message);
      setTimeout(() => setToast(null), 4000);
      setTimeout(load, 15000);
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

  const okCount    = statuses.filter(s => s.status === "ok").length;
  const warnCount  = statuses.filter(s => s.status === "warn").length;
  const errorCount = statuses.filter(s => s.status === "error").length;

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">앱 관리 대시보드</h1>
            {lastRefresh && (
              <p className="text-sm text-slate-500 mt-0.5">
                마지막 갱신: {lastRefresh.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                <span className="ml-2 text-slate-400">(60초 자동 갱신)</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setLoading(true); load(); }}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
            <button
              onClick={() => handleRun(false)}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {running ? "실행 중…" : "즉시 점검"}
            </button>
            <button
              onClick={() => handleRun(true)}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
            >
              슬랙 발송
            </button>
          </div>
        </div>

        {statuses.length > 0 && (
          <div className="flex gap-3 mt-4 text-sm">
            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              ✅ 정상 {okCount}
            </span>
            {warnCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                ⚠️ 경고 {warnCount}
              </span>
            )}
            {errorCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                ❌ 오류 {errorCount}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-56 rounded-xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : statuses.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <p className="text-lg mb-2">점검 이력이 없습니다</p>
            <p className="text-sm">위의 <strong>즉시 점검</strong> 버튼을 눌러 첫 점검을 실행하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {statuses.map(s => (
              <AppCard
                key={s.app_name}
                s={s}
                availability={availMap[s.app_name] ?? null}
                onRecheckDone={handleRecheckDone}
              />
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  );
}
