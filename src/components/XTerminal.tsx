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

// "At bottom" tolerance in CSS px. Smaller than one row (~18px) so a deliberate
// one-line scroll-up reads as not-at-bottom, but large enough to absorb
// sub-pixel rounding during active tailing.
const AT_BOTTOM_EPS_PX = 8;

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
      // Deeper history so there's something to scroll *into*. claude's Ink TUI
      // renders to the normal buffer (not alt-screen), so past output scrolls
      // up as real scrollback; the 1000-line default truncated long sessions.
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    let ws: WebSocket | null = null;
    let viewportEl: HTMLElement | null = null;
    let dataSub: { dispose: () => void } | null = null;
    let binSub: { dispose: () => void } | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    let resizeObserver: ResizeObserver | null = null;

    // Follow-tail = plain standard-terminal / tmux semantics: tail at the
    // bottom, stay put when scrolled up, resume tailing when the user returns.
    // No mode, no lock, no button.
    //
    // The source of truth for "is the user at the bottom" is the DOM
    // .xterm-viewport (scrollHeight − scrollTop − clientHeight ≤ EPS), read
    // synchronously before each write — NOT xterm's buffer.viewportY.
    //
    // Why not viewportY: xterm only updates viewportY / its internal
    // isUserScrolling flag from the DOM 'scroll' event, and browsers dispatch
    // scroll events asynchronously (next frame). On mobile, a touch-drag changes
    // .xterm-viewport.scrollTop instantly but xterm's state lags a frame; claude
    // streams several writes/sec, so a write lands in that stale window while
    // isUserScrolling is still false → xterm's auto-follow (BufferService.scroll:
    // `isUserScrolling || ydisp++`) yanks the viewport to the new bottom. That is
    // the "drag up, snaps back immediately" bounce — and it lives in xterm's own
    // render, which is why the previous stick-flag fixes (callback layer) missed.
    //
    // Fix: read the DOM before each write. If the user is scrolled up there but
    // xterm still thinks it's at the bottom, sync xterm to the DOM *now*
    // (scrollToLine flips isUserScrolling synchronously) so the upcoming write
    // can't auto-follow. The explicit scrollToBottom (gated on DOM-at-bottom) is
    // still needed because the attach replay + tmux redraw land the viewport
    // off-bottom, defeating xterm's at-baseY auto-stick.

    // Defer open until container has dimensions (avoids "dimensions" crash on first render)
    const openTimer = setTimeout(() => {
      try {
        term.open(container);
        fit.fit();
        term.focus();
      } catch { return; }

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
              // Start tailing from a known at-bottom baseline once the replay +
              // redraw settle (the attach leaves the viewport off-bottom). The
              // user hasn't scrolled yet at attach time, so this is unconditional.
              requestAnimationFrame(() => {
                try { term.scrollToBottom(); } catch {}
              });
            }
            if (msg.type === "detached") {
              term.write("\r\n\x1b[33m[session detached]\x1b[0m\r\n");
            }
          } catch {}
        } else {
          // Binary PTY data → render in xterm.js. Decide tail-vs-stay from the
          // DOM viewport (the user's real position this instant), not xterm's
          // frame-lagged viewportY — see the block comment above.
          const b = term.buffer.active;
          const vp = viewportEl ?? (viewportEl = container.querySelector(".xterm-viewport"));
          let atBottom = b.viewportY >= b.baseY - 1; // fallback if DOM not ready
          if (vp) {
            atBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight <= AT_BOTTOM_EPS_PX;
            // Stale window: DOM is scrolled up but xterm's state still reads
            // at-bottom (its async scroll event hasn't fired). Sync xterm to the
            // DOM now so the write below cannot auto-follow and bounce the user.
            if (!atBottom && b.viewportY >= b.baseY - 1 && b.length > 0) {
              const rowH = vp.scrollHeight / b.length;
              const targetLine = Math.max(0, Math.min(b.baseY, Math.round(vp.scrollTop / rowH)));
              try { term.scrollToLine(targetLine); } catch {}
            }
          }
          term.write(new Uint8Array(e.data), () => {
            if (atBottom) { try { term.scrollToBottom(); } catch {} }
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
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
      term.dispose();
    };
  }, [target]);

  return <div ref={containerRef} className="w-full h-full" />;
});
