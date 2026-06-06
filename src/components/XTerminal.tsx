import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../lib/api";
import type { AgentState } from "../lib/types";

interface XTerminalProps {
  target: string;
  onClose: () => void;
  onNavigate: (dir: -1 | 1) => void;
  siblings: AgentState[];
  onSelectSibling: (agent: AgentState) => void;
  readOnly?: boolean;
}

// Imperative handle so the chrome (TerminalModal) can inject text into the PTY
// without owning the WebSocket — used by the 📎 attach button to type a saved
// image path into the running Oracle, mirroring TerminalView's queueSend path.
export interface XTerminalHandle {
  inject: (text: string) => void;
}

const enc = new TextEncoder();

// Catppuccin Mocha palette (matches AC array in ansi.ts)
const THEME = {
  background: "#0a0a0f",
  foreground: "#cdd6f4",
  cursor: "#22d3ee",
  cursorAccent: "#0a0a0f",
  selectionBackground: "#585b7066",
  black: "#0a0a0f",
  red: "#f38ba8",
  green: "#a6e3a1",
  yellow: "#f9e2af",
  blue: "#89b4fa",
  magenta: "#cba6f7",
  cyan: "#94e2d5",
  white: "#cdd6f4",
  brightBlack: "#585b70",
  brightRed: "#f38ba8",
  brightGreen: "#a6e3a1",
  brightYellow: "#f9e2af",
  brightBlue: "#89b4fa",
  brightMagenta: "#cba6f7",
  brightCyan: "#94e2d5",
  brightWhite: "#ffffff",
};

export const XTerminal = forwardRef<XTerminalHandle, XTerminalProps>(function XTerminal(
  { target, onClose, onNavigate, siblings, onSelectSibling, readOnly = false },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Inject text into the live PTY as if typed. `\r` submits (xterm sends CR on
  // Enter). No-op in read-only mode or when the socket isn't open.
  useImperativeHandle(ref, () => ({
    inject: (text: string) => {
      const ws = wsRef.current;
      if (readOnly || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(enc.encode(text));
    },
  }), [readOnly]);

  // Keep callbacks in refs so terminal effect doesn't re-run on every render
  const onCloseRef = useRef(onClose);
  const onNavigateRef = useRef(onNavigate);
  const siblingsRef = useRef(siblings);
  const onSelectSiblingRef = useRef(onSelectSibling);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { siblingsRef.current = siblings; }, [siblings]);
  useEffect(() => { onSelectSiblingRef.current = onSelectSibling; }, [onSelectSibling]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      theme: THEME,
      fontFamily: "Monaco, 'Cascadia Code', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: !readOnly,
      cursorStyle: readOnly ? "underline" : "bar",
      disableStdin: readOnly,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    let ws: WebSocket | null = null;
    let dataSub: { dispose: () => void } | null = null;
    let binSub: { dispose: () => void } | null = null;
    let scrollSub: { dispose: () => void } | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let resizeObserver: ResizeObserver | null = null;

    // Follow-tail state. xterm.js only auto-sticks to the bottom when the
    // viewport is *already* exactly at baseY; the attach sequence (a large
    // replayCapture blob + tmux's live redraw with cursor repositioning) lands
    // the viewport off-bottom, which permanently defeats that default — every
    // later write looks "not at bottom" so new output never scrolls into view
    // (Boss: dashboard pane never follows, desktop + mobile). We restore the
    // follow-tail explicitly, mirroring TerminalView's atBottom→scrollTo logic.
    // `stick` defaults true (follow); a user scroll-up turns it off, scrolling
    // back to the bottom turns it on again. Each followed write re-asserts the
    // bottom, so a corrupted initial viewport position self-heals.
    let stick = true;

    // Defer open until container has dimensions (avoids "dimensions" crash on first render)
    const openTimer = setTimeout(() => {
      try {
        term.open(container);
        fit.fit();
        term.focus();
      } catch { return; }

      // Track whether the viewport is pinned to the bottom. Fires on both user
      // scrolls and programmatic scrollToBottom (which re-pins stick=true), so
      // the follow-tail recovers itself after every followed write.
      scrollSub = term.onScroll(() => {
        const b = term.buffer.active;
        stick = b.viewportY >= b.baseY - 1;
      });

      // Connect to PTY WebSocket
      ws = new WebSocket(wsUrl("/ws/pty"));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        ws!.send(JSON.stringify({
          type: "attach",
          target,
          cols: term.cols,
          rows: term.rows,
        }));
      };

      ws.onmessage = (e) => {
        if (typeof e.data === "string") {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "attached") {
              // Fit terminal to container — server ignores resize for grouped sessions
              try { fit.fit(); } catch {}
              // Pin to the bottom once the replay + redraw have settled, so the
              // follow-tail starts from a known at-bottom baseline rather than
              // wherever tmux's repaint left the viewport.
              stick = true;
              requestAnimationFrame(() => { try { term.scrollToBottom(); } catch {} });
            }
            if (msg.type === "detached") {
              term.write("\r\n\x1b[33m[session detached]\x1b[0m\r\n");
            }
          } catch {}
        } else {
          // Binary PTY data → render in xterm.js. Capture follow state BEFORE
          // the write (the write grows baseY); re-pin to the bottom afterward
          // if we were following, so live output stays in view without yanking
          // a user who has scrolled up to read history.
          const wasStick = stick;
          term.write(new Uint8Array(e.data), () => {
            if (wasStick) term.scrollToBottom();
          });
        }
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[31m[connection closed]\x1b[0m\r\n");
      };

      if (!readOnly) {
        // Keystrokes → binary to PTY stdin
        const encoder = new TextEncoder();
        dataSub = term.onData((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(encoder.encode(data));
          }
        });

        binSub = term.onBinary((data) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            const bytes = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
            ws.send(bytes);
          }
        });
      }

      // Navigation shortcuts (work in both read-only and interactive)
      term.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;
        if (readOnly) return false; // Block all keys in read-only
        if (e.altKey && e.key === "ArrowLeft") { onNavigateRef.current(-1); return false; }
        if (e.altKey && e.key === "ArrowRight") { onNavigateRef.current(1); return false; }
        if (e.altKey && e.key >= "1" && e.key <= "9") {
          const idx = parseInt(e.key) - 1;
          if (idx < siblingsRef.current.length) onSelectSiblingRef.current(siblingsRef.current[idx]);
          return false;
        }
        return true;
      });

      // Auto-resize with debounce
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            fit.fit();
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            }
          } catch {}
        }, 200);
      });
      resizeObserver.observe(container);
    }, 50);

    return () => {
      clearTimeout(openTimer);
      clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      dataSub?.dispose();
      binSub?.dispose();
      scrollSub?.dispose();
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
      term.dispose();
    };
  }, [target]);

  return <div ref={containerRef} className="w-full h-full" />;
});
