import { memo, useMemo, useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import { agentColor, agentIcon } from "../lib/constants";
import { describeActivity, type FeedEvent } from "../lib/feed";

type TimeRange = "today" | "24h" | "7d" | "all";
const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "today", label: "วันนี้" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "all", label: "ทั้งหมด" },
];

function timeRangeStart(range: TimeRange): number {
  if (range === "all") return 0;
  if (range === "24h") return Date.now() - 24 * 3600_000;
  if (range === "7d") return Date.now() - 7 * 24 * 3600_000;
  // today = local midnight (feed ts are +07 epoch ms; dashboard runs in BKK)
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function Chip({ children, active, onClick, color }: { children: ReactNode; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`font-mono text-[11px] px-2.5 py-1 rounded-full border transition-colors min-h-[32px] ${
        active ? "border-white/30 bg-white/10 text-slate-100" : "border-white/10 text-slate-400 hover:text-slate-200"
      }`}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {children}
    </button>
  );
}

const EVENT_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  PreToolUse: { icon: "🔧", label: "Tool call", color: "#fbbf24" },
  PostToolUse: { icon: "✅", label: "Tool done", color: "#22c55e" },
  PostToolUseFailure: { icon: "❌", label: "Tool failed", color: "#ef4444" },
  UserPromptSubmit: { icon: "💬", label: "User input", color: "#60a5fa" },
  Stop: { icon: "⏸", label: "Waiting", color: "#94a3b8" },
  SessionEnd: { icon: "🏁", label: "Session ended", color: "#64748b" },
  SubagentStart: { icon: "🚀", label: "Subagent", color: "#c084fc" },
  TaskCompleted: { icon: "🎯", label: "Task done", color: "#22c55e" },
  Notification: { icon: "🔔", label: "Notification", color: "#fb923c" },
  Error: { icon: "💥", label: "Error", color: "#ef4444" },
};

function formatTime(ts: number | string): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3600_000)}h ago`;
}

interface OracleGroup {
  oracle: string;
  events: FeedEvent[];
  lastActive: number;
  currentActivity: string;
}

const EventRow = memo(function EventRow({ event }: { event: FeedEvent }) {
  const config = EVENT_LABELS[event.event] || { icon: "📋", label: event.event, color: "#94a3b8" };
  const message = event.message?.slice(0, 120) || describeActivity(event);

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-white/[0.02]">
      <span className="text-sm mt-0.5 shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold" style={{ color: config.color }}>{config.label}</span>
          <span className="font-mono text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>{formatTime(event.timestamp || event.ts)}</span>
        </div>
        {message && (
          <p className="font-mono text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>{message}</p>
        )}
      </div>
    </div>
  );
});

const OracleTimeline = memo(function OracleTimeline({
  group,
  expanded,
  onToggle,
}: {
  group: OracleGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = agentColor(group.oracle + "-oracle");
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(group.events.length);

  // Auto-scroll when new events arrive (only if already near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !expanded) return;
    if (group.events.length > prevCountRef.current) {
      // Events are newest-first, so scroll to top for latest
      el.scrollTop = 0;
    }
    prevCountRef.current = group.events.length;
  }, [group.events.length, expanded]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header — clickable to expand/collapse */}
      <div
        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4 cursor-pointer select-none transition-colors hover:bg-white/[0.03] min-h-[52px]"
        style={{ borderBottom: expanded ? "1px solid rgba(255,255,255,0.06)" : "none" }}
        onClick={onToggle}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ background: color, color: "#000", opacity: 0.9 }}
        >
          {agentIcon(group.oracle + "-oracle") || group.oracle.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h3 className="font-mono font-bold" style={{ color }}>{group.oracle}</h3>
          <p className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {group.currentActivity} · {timeAgo(group.lastActive)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{group.events.length} events</span>
          <span
            className="text-xs transition-transform duration-200"
            style={{ color: "rgba(255,255,255,0.3)", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Timeline — collapsible */}
      {expanded && (
        <div ref={scrollRef} className="px-2 py-2 max-h-64 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {group.events.map((event, i) => (
            <EventRow key={`${event.ts}-${i}`} event={event} />
          ))}
        </div>
      )}
    </div>
  );
});

export function ProgressViewer({ feedEvents }: { feedEvents: FeedEvent[] }) {
  const [expandedOracles, setExpandedOracles] = useState<Set<string>>(new Set());

  // --- search + filter state ---
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [oracleFilter, setOracleFilter] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const toggleOracle = useCallback((oracle: string) => {
    setExpandedOracles((prev) => {
      const next = new Set(prev);
      if (next.has(oracle)) next.delete(oracle);
      else next.add(oracle);
      return next;
    });
  }, []);

  // Chip option lists derived from the FULL feed so they stay stable while filtering
  const { oracleOptions, eventOptions } = useMemo(() => {
    const os = new Set<string>();
    const es = new Set<string>();
    for (const e of feedEvents) {
      os.add(e.oracle);
      es.add(e.event);
    }
    return { oracleOptions: [...os].sort(), eventOptions: [...es] };
  }, [feedEvents]);

  const filteredEvents = useMemo(() => {
    const start = timeRangeStart(timeRange);
    return feedEvents.filter((e) => {
      if (oracleFilter && e.oracle !== oracleFilter) return false;
      if (eventFilter && e.event !== eventFilter) return false;
      if (start && (e.ts || 0) < start) return false;
      if (debouncedQuery) {
        const hay = `${e.message} ${e.project} ${e.oracle}`.toLowerCase();
        if (!hay.includes(debouncedQuery)) return false;
      }
      return true;
    });
  }, [feedEvents, oracleFilter, eventFilter, timeRange, debouncedQuery]);

  const filtersActive = !!(debouncedQuery || oracleFilter || eventFilter || timeRange !== "all");
  const clearFilters = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setOracleFilter(null);
    setEventFilter(null);
    setTimeRange("all");
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const e of filteredEvents) {
      const arr = map.get(e.oracle) || [];
      arr.push(e);
      map.set(e.oracle, arr);
    }

    const result: OracleGroup[] = [];
    for (const [oracle, events] of map) {
      const sorted = [...events].sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const last = sorted[0];
      result.push({
        oracle,
        events: sorted.slice(0, 30),
        lastActive: last?.ts || 0,
        currentActivity: last ? describeActivity(last) : "—",
      });
    }

    return result.sort((a, b) => b.lastActive - a.lastActive);
  }, [filteredEvents]);

  // Auto-expand the most recently active oracle (first non-empty render only)
  useEffect(() => {
    if (feedEvents.length > 0 && expandedOracles.size === 0) {
      setExpandedOracles(new Set(groups.length > 0 ? [groups[0].oracle] : []));
    }
  }, [feedEvents.length > 0]);

  // No feed at all → the original empty state
  if (feedEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>No activity yet</p>
          <p className="font-mono text-xs mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>Feed events will appear here as agents work</p>
        </div>
      </div>
    );
  }

  const allExpanded = groups.length > 0 && groups.every((g) => expandedOracles.has(g.oracle));

  return (
    <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-mono" style={{ color: "#e2e8f0" }}>Progress</h1>
          <p className="font-mono text-[10px] sm:text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {groups.length} oracle{groups.length !== 1 ? "s" : ""} ·{" "}
            {filtersActive ? `${filteredEvents.length} / ${feedEvents.length}` : feedEvents.length} events
          </p>
        </div>
        <button
          className="font-mono text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] min-h-[44px] sm:min-h-0"
          style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
          onClick={() => {
            if (allExpanded) setExpandedOracles(new Set());
            else setExpandedOracles(new Set(groups.map((g) => g.oracle)));
          }}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {/* search + filter controls */}
      <div className="flex flex-col gap-2 mb-4 sm:mb-6">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา message / project / oracle…"
            className="w-full font-mono text-xs sm:text-sm rounded-lg bg-white/[0.03] border border-white/10 text-slate-100 placeholder:text-slate-500 pl-3 pr-8 py-2 min-h-[40px] focus:outline-none focus:border-white/25 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* time range */}
        <div className="flex flex-wrap gap-1.5">
          {TIME_RANGES.map((r) => (
            <Chip key={r.key} active={timeRange === r.key} onClick={() => setTimeRange(r.key)}>
              {r.label}
            </Chip>
          ))}
        </div>

        {/* per-oracle */}
        <div className="flex flex-wrap gap-1.5">
          {oracleOptions.map((o) => (
            <Chip
              key={o}
              active={oracleFilter === o}
              color={agentColor(o + "-oracle")}
              onClick={() => setOracleFilter(oracleFilter === o ? null : o)}
            >
              {o}
            </Chip>
          ))}
        </div>

        {/* event type */}
        <div className="flex flex-wrap gap-1.5">
          {eventOptions.map((ev) => {
            const cfg = EVENT_LABELS[ev];
            return (
              <Chip
                key={ev}
                active={eventFilter === ev}
                color={cfg?.color}
                onClick={() => setEventFilter(eventFilter === ev ? null : ev)}
              >
                {cfg ? `${cfg.icon} ${cfg.label}` : ev}
              </Chip>
            );
          })}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex items-center justify-center h-[40vh]">
          <div className="text-center">
            <div className="text-3xl mb-3">🔍</div>
            <p className="font-mono text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>ไม่พบเหตุการณ์ที่ตรงกับตัวกรอง</p>
            <button
              onClick={clearFilters}
              className="font-mono text-xs mt-3 px-3 py-1.5 rounded-lg transition-colors hover:bg-white/[0.06] min-h-[40px]"
              style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {groups.map((group) => (
            <OracleTimeline
              key={group.oracle}
              group={group}
              expanded={expandedOracles.has(group.oracle)}
              onToggle={() => toggleOracle(group.oracle)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
