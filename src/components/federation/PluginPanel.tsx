import { useState } from "react";
import { useFederationStore } from "./store";

const TYPE_ICONS: Record<string, string> = {
  ts: "TS",
  wasm: "WS",
  "wasm-shared": "WS",
};

export function PluginPanel() {
  const { plugins, liveMessages } = useFederationStore();
  const [open, setOpen] = useState(false);

  if (plugins.length === 0 && liveMessages.length === 0) return null;

  const totalEvents = plugins.reduce((s, p) => s + p.events, 0);

  // Collapsed: just a small pill
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border cursor-pointer hover:bg-white/[0.05] transition-colors"
        style={{ background: "rgba(3,10,24,0.9)", borderColor: "rgba(255,255,255,0.08)" }}>
        <span className="text-[9px]">{"\uD83E\uDDE9"}</span>
        <span className="text-[9px] font-mono text-white/40">{plugins.length}</span>
        {liveMessages.length > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 w-[280px] rounded-lg border overflow-hidden"
      style={{
        background: "rgba(3,10,24,0.95)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
      }}>

      <div className="flex items-center gap-2 px-3 py-2 border-b cursor-pointer hover:bg-white/[0.03]"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
        onClick={() => setOpen(false)}>
        <span className="text-[10px]">{"\uD83E\uDDE9"}</span>
        <span className="text-[10px] font-mono font-bold text-white/60">Plugins</span>
        <span className="text-[9px] font-mono text-white/25 ml-auto">{totalEvents} events</span>
        <span className="text-[9px] text-white/20">{"\u2715"}</span>
      </div>

      <div className="max-h-[200px] overflow-y-auto">
        {plugins.map((p) => (
          <div key={p.name} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03]"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span className="text-[8px] font-mono font-bold px-1 rounded"
              style={{
                background: p.type.startsWith("wasm") ? "rgba(155,93,229,0.2)" : "rgba(0,187,249,0.2)",
                color: p.type.startsWith("wasm") ? "#9b5de5" : "#00bbf9",
              }}>
              {TYPE_ICONS[p.type] || p.type}
            </span>
            <span className="text-[10px] font-mono text-white/50 truncate flex-1">{p.name}</span>
            <span className="text-[8px] font-mono text-white/20">{p.events}</span>
            {p.errors > 0 && (
              <span className="text-[8px] font-mono text-red-400">{p.errors}!</span>
            )}
          </div>
        ))}
      </div>

      {liveMessages.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <span className="text-[10px]">{"\uD83D\uDCAC"}</span>
            <span className="text-[9px] font-mono text-cyan-400/50">Live Messages</span>
          </div>
          <div className="max-h-[80px] overflow-y-auto">
            {[...liveMessages].reverse().slice(0, 5).map((m, i) => {
              const age = Math.floor((Date.now() - m.ts) / 1000);
              return (
                <div key={i} className="flex items-center gap-1.5 px-3 py-0.5 text-[9px] font-mono">
                  <span className="text-cyan-400/60">{m.from}</span>
                  <span className="text-white/20">{"\u2192"}</span>
                  <span className="text-cyan-400/60">{m.to}</span>
                  <span className="text-white/15 ml-auto">{age}s ago</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
