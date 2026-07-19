import { useState, useEffect, useCallback } from "react";
import { apiUrl } from "../lib/api";
import { PageShell } from "./PageShell";

// Ops panel — glanceable health of the family's operational layer (C1G nudge,
// sweep cron, morning scan, offsite backup, maw runtime). Feature F2 of the
// 2026-07-19 MAW deep-analysis: those signals were Discord-only, so a silent
// cron death was invisible ("no alerts ≠ healthy"). Data side is Pulse-owned.
//
// CONTRACT v1 (FROZEN — Pulse writes tmp+mv every ~5min to
// /opt/maw-dashboard/ops/status.json, served at /maw/ops/status.json; do not
// change unilaterally):
//   { v:1, generatedAt:ISO, host, systems:[
//       { id, label, state:"green"|"yellow"|"red", lastOk:ISO, detail, history:[10× 1|0] } ] }

interface OpsSystem {
  id: string;
  label: string;
  state: "green" | "yellow" | "red";
  lastOk: string;
  detail: string;
  history: number[];
}
interface OpsStatus {
  v: number;
  generatedAt: string;
  host: string;
  systems: OpsSystem[];
}

const STALE_MS = 15 * 60 * 1000; // generatedAt older than this → whole panel is suspect

const STATE_COLOR: Record<OpsSystem["state"], string> = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
};

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "—";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return "now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// 10-cell uptime strip — 1 = ok tick (state color), 0 = failed tick (red). The
// inline "N/10" is the ok-count of the last 10 (Boss's glanceable standard).
function HistoryStrip({ history, state }: { history: number[]; state: OpsSystem["state"] }) {
  const cells = history.slice(-10);
  while (cells.length < 10) cells.unshift(-1); // pad missing history as blank
  const okCount = cells.filter((c) => c === 1).length;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {cells.map((c, i) => (
          <span
            key={i}
            className="w-2.5 h-4 rounded-[2px]"
            style={{
              background: c === 1 ? STATE_COLOR[state] : c === 0 ? "#ef4444" : "rgba(255,255,255,0.06)",
              opacity: c === 1 ? 0.85 : c === 0 ? 0.7 : 1,
            }}
          />
        ))}
      </div>
      <span className="text-[11px] font-mono text-white/40 tabular-nums">{okCount}/10</span>
    </div>
  );
}

export function OpsView() {
  const [status, setStatus] = useState<OpsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/ops/status.json"), { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as OpsStatus;
      setStatus(data);
      setError(false);
    } catch {
      setError(true);
      setStatus(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000); // Pulse writes ~q5min; 60s poll is ample
    return () => clearInterval(t);
  }, [load]);

  const stale = status ? Date.now() - Date.parse(status.generatedAt) > STALE_MS : false;

  return (
    <PageShell maxWidth="900px">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-slate-100">
          🩺 Ops <span className="text-slate-500 text-sm font-normal">— สุขภาพระบบอัตโนมัติ</span>
        </h1>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded min-h-[44px] sm:min-h-0">↻</button>
      </div>

      {/* Staleness guard — an old generatedAt means the writer itself may be dead;
          no-alerts ≠ healthy, so the whole panel is flagged, not silently trusted. */}
      {stale && status && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 text-[13px]">
          ⚠️ ข้อมูลค้าง — อัปเดตล่าสุด {timeAgo(status.generatedAt)} (เกิน 15 นาที). ตัวเขียน status อาจหยุดทำงาน — สถานะด้านล่างอาจไม่เป็นปัจจุบัน.
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 text-sm py-8 text-center">กำลังโหลด…</div>
      ) : error || !status ? (
        <div className="text-slate-500 text-sm py-8 text-center border border-white/10 rounded-lg">
          ยังไม่มีข้อมูล ops (status.json)<div className="text-[11px] text-slate-600 mt-1">รอ Pulse เขียน /maw/ops/status.json</div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {status.systems.map((sys) => (
              <div key={sys.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
                <div className="flex items-center gap-2 sm:w-[190px] sm:shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATE_COLOR[sys.state], boxShadow: `0 0 6px ${STATE_COLOR[sys.state]}66` }} />
                  <span className="text-[13px] text-slate-200 font-medium truncate">{sys.label}</span>
                </div>
                <HistoryStrip history={sys.history || []} state={sys.state} />
                <div className="flex-1 min-w-0 flex flex-col sm:items-end">
                  <span className="text-[11px] text-slate-500">last ok {timeAgo(sys.lastOk)}</span>
                  <span className="text-[11px] text-slate-400 truncate max-w-full">{sys.detail}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-[10px] text-slate-600 font-mono">
            {status.host} · generated {timeAgo(status.generatedAt)} · contract v{status.v}
          </div>
        </>
      )}
    </PageShell>
  );
}
