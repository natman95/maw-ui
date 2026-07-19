import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { apiFetch } from "../lib/apiFetch";
import { agentColor } from "../lib/constants";
import { PageShell } from "./PageShell";

// ψ-Mail — the inter-Oracle mail (ψ/inbox/*.md) surfaced in the dashboard so
// Boss reads family coordination from mobile without opening a terminal.
// Feature F1 of the 2026-07-19 MAW deep-analysis. Backend: GET /api/psi-mail,
// GET /api/psi-mail/body, POST /api/psi-mail/mark-read (all nginx-auth-gated).

interface MailItem {
  id: string;
  file: string;
  oracleHome: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  type: string;
  read: boolean;
  preview: string;
}

function timeAgo(dateStr: string): string {
  const t = Date.parse(dateStr);
  if (isNaN(t)) return dateStr || "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 0) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const TYPE_COLOR: Record<string, string> = {
  coordination: "#a855f7",
  "ship-report": "#4ecdc4",
  "completion-report": "#82e0aa",
  signal: "#45b7d1",
  alert: "#ff6b6b",
  "hr-question": "#f0b27a",
  "erp-question": "#f7dc6f",
};
function typeColor(t: string): string {
  return TYPE_COLOR[t] || "#94a3b8";
}

// ── markdown-lite: handmade, no dependency (ui-ux-pro-max retired; Simplicity-
// First). Handles the shapes ψ messages actually use — headings, bullets, code
// fences, hr, and inline **bold** / `code` / [text](url). Anything else renders
// verbatim with line breaks preserved. Not a full CommonMark engine by design. ──
function renderInline(text: string, keyBase: string) {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`} className="font-semibold text-slate-100">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={`${keyBase}-c${i}`} className="px-1 py-0.5 rounded bg-white/10 text-[0.9em] text-cyan-200">{m[3]}</code>);
    } else if (m[4] !== undefined) {
      nodes.push(<a key={`${keyBase}-a${i}`} href={m[5]} target="_blank" rel="noreferrer" className="text-sky-400 underline break-all">{m[4]}</a>);
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ body }: { body: string }) {
  const lines = body.split("\n");
  const blocks: React.ReactNode[] = [];
  let inFence = false;
  let fence: string[] = [];
  lines.forEach((line, idx) => {
    if (line.trim().startsWith("```")) {
      if (inFence) {
        blocks.push(
          <pre key={`f${idx}`} className="my-2 p-3 rounded-lg bg-black/40 overflow-x-auto text-[12px] leading-relaxed text-slate-200">
            <code>{fence.join("\n")}</code>
          </pre>,
        );
        fence = [];
        inFence = false;
      } else {
        inFence = true;
      }
      return;
    }
    if (inFence) { fence.push(line); return; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      blocks.push(
        <div key={`h${idx}`} className={`mt-3 mb-1 font-semibold text-slate-100 ${lvl <= 1 ? "text-base" : lvl === 2 ? "text-sm" : "text-[13px]"}`}>
          {renderInline(h[2], `h${idx}`)}
        </div>,
      );
      return;
    }
    if (/^\s*([-*])\s+/.test(line)) {
      blocks.push(
        <div key={`li${idx}`} className="flex gap-2 pl-1 my-0.5">
          <span className="text-slate-500 select-none">•</span>
          <span className="flex-1">{renderInline(line.replace(/^\s*[-*]\s+/, ""), `li${idx}`)}</span>
        </div>,
      );
      return;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={`hr${idx}`} className="my-3 border-white/10" />);
      return;
    }
    if (line.trim() === "") {
      blocks.push(<div key={`sp${idx}`} className="h-2" />);
      return;
    }
    blocks.push(
      <div key={`p${idx}`} className="my-0.5 leading-relaxed break-words">{renderInline(line, `p${idx}`)}</div>,
    );
  });
  if (inFence && fence.length) {
    blocks.push(
      <pre key="f-tail" className="my-2 p-3 rounded-lg bg-black/40 overflow-x-auto text-[12px] text-slate-200"><code>{fence.join("\n")}</code></pre>,
    );
  }
  return <div className="text-[13px] text-slate-300">{blocks}</div>;
}

export function MailView() {
  const [items, setItems] = useState<MailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [bodyLoading, setBodyLoading] = useState(false);
  const [oracleFilter, setOracleFilter] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ messages: MailItem[] }>("/api/psi-mail?limit=200");
      setItems(data.messages || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const oracles = useMemo(() => [...new Set(items.map((m) => m.oracleHome))].sort(), [items]);
  const unreadCount = useMemo(() => items.filter((m) => !m.read).length, [items]);

  const filtered = useMemo(() => items.filter((m) => {
    if (oracleFilter && m.oracleHome !== oracleFilter) return false;
    if (unreadOnly && m.read) return false;
    return true;
  }), [items, oracleFilter, unreadOnly]);

  const selected = useMemo(() => items.find((m) => m.id === selectedId) || null, [items, selectedId]);

  const open = useCallback(async (m: MailItem) => {
    setSelectedId(m.id);
    setBody("");
    setBodyLoading(true);
    try {
      const data = await apiFetch<{ body: string }>(`/api/psi-mail/body?id=${encodeURIComponent(m.id)}`);
      setBody(data.body || "");
    } catch {
      setBody("_(could not load message body)_");
    }
    setBodyLoading(false);
    // mark-read on open (optimistic; server injects read:<ISO>)
    if (!m.read) {
      setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      apiFetch("/api/psi-mail/mark-read", { method: "POST", body: JSON.stringify({ id: m.id }) }).catch(() => {
        // revert on failure so the unread state stays honest
        setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, read: false } : x)));
      });
    }
  }, []);

  return (
    <PageShell maxWidth="1300px" className="h-full">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-semibold text-slate-100">
          ✉️ ψ-Mail <span className="text-slate-500 text-sm font-normal">— จดหมายระหว่าง Oracle</span>
        </h1>
        <button onClick={load} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded min-h-[44px] sm:min-h-0">↻ refresh</button>
      </div>

      {/* filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Chip active={!oracleFilter} onClick={() => setOracleFilter(null)}>ทั้งหมด</Chip>
        {oracles.map((o) => (
          <Chip key={o} active={oracleFilter === o} onClick={() => setOracleFilter(oracleFilter === o ? null : o)} color={agentColor(o)}>
            {o}
          </Chip>
        ))}
        <Chip active={unreadOnly} onClick={() => setUnreadOnly((v) => !v)}>
          unread{unreadCount ? ` (${unreadCount})` : ""}
        </Chip>
      </div>

      <div className="flex flex-col md:flex-row gap-4" style={{ minHeight: "60vh" }}>
        {/* list — hidden on mobile when a message is open */}
        <div className={`${selected ? "hidden md:flex" : "flex"} flex-col gap-1.5 md:w-[360px] md:shrink-0`}>
          {loading ? (
            <div className="text-slate-500 text-sm py-8 text-center">กำลังโหลด…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-500 text-sm py-8 text-center">ไม่มีจดหมาย</div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => open(m)}
                className={`text-left p-2.5 rounded-lg border transition-colors min-h-[44px] ${
                  selectedId === m.id ? "border-white/25 bg-white/[0.06]" : "border-white/10 hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {!m.read && <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" aria-label="unread" />}
                  <span className="text-[11px]" style={{ color: agentColor(m.from) }}>{m.from}</span>
                  <span className="text-slate-600 text-[10px]">→</span>
                  <span className="text-[11px]" style={{ color: agentColor(m.to) }}>{m.to}</span>
                  <span className="ml-auto text-[10px] text-slate-500">{timeAgo(m.date)}</span>
                </div>
                <div className={`text-[13px] truncate ${m.read ? "text-slate-400" : "text-slate-100 font-semibold"}`}>
                  {m.subject}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${typeColor(m.type)}22`, color: typeColor(m.type) }}>
                    {m.type}
                  </span>
                  <span className="text-[10px] text-slate-600 truncate">{m.preview.slice(0, 60)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* reader — hidden on mobile until a message is open; placeholder on desktop */}
        <div className={`${selected ? "flex" : "hidden md:flex"} flex-1 flex-col rounded-lg border border-white/10 bg-white/[0.02] p-4 min-w-0`}>
          {!selected ? (
            <div className="text-slate-600 text-sm m-auto">เลือกจดหมายเพื่ออ่าน</div>
          ) : (
            <Fragment>
              <button onClick={() => setSelectedId(null)} className="md:hidden text-xs text-slate-400 mb-2 min-h-[44px] text-left">← กลับ</button>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-semibold" style={{ color: agentColor(selected.from) }}>{selected.from}</span>
                <span className="text-slate-600">→</span>
                <span className="text-sm font-semibold" style={{ color: agentColor(selected.to) }}>{selected.to}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${typeColor(selected.type)}22`, color: typeColor(selected.type) }}>
                  {selected.type}
                </span>
                <span className="ml-auto text-[11px] text-slate-500">{selected.date || timeAgo(selected.date)}</span>
              </div>
              <div className="text-base font-semibold text-slate-100 mb-1">{selected.subject}</div>
              <div className="text-[10px] text-slate-600 mb-3">{selected.oracleHome} · {selected.file}</div>
              <div className="overflow-y-auto flex-1 min-h-0">
                {bodyLoading ? <div className="text-slate-500 text-sm">กำลังโหลด…</div> : <Markdown body={body} />}
              </div>
            </Fragment>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function Chip({ children, active, onClick, color }: { children: React.ReactNode; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors min-h-[32px] ${
        active ? "border-white/30 bg-white/10 text-slate-100" : "border-white/10 text-slate-400 hover:text-slate-200"
      }`}
      style={active && color ? { borderColor: color, color } : undefined}
    >
      {children}
    </button>
  );
}
