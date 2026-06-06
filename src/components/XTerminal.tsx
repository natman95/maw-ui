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
      // Deeper history so there's something to scroll *into*. claude's Ink TUI
      // renders to the normal buffer (not alt-screen), so past output scrolls
      // up as real scrollback; the 1000-line default truncated long sessions.
      scrollback: 5000,
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
    //
    // Two-flag model so a deliberate scroll-up *holds*. claude's Ink TUI
    // repaints by clear+rewrite; each repaint write momentarily collapses the
    // viewport to the bottom and fires onScroll. The old single-`stick` model
    // re-read that collapse as "user is at bottom" → silently re-enabled follow
    // → the next write yanked a user who had scrolled up to read history.
    //   `stick`        — currently following the bottom (re-asserted per write).
    //   `userPinnedUp` — DURABLE user intent. Set when the *user* scrolls up;
    //                    cleared only when the *user* scrolls back to the bottom
    //                    (or taps "jump to latest"). A programmatic or
    //                    content-driven scroll must never clear it.
    //   `scrollGuard`  — refcount >0 while our own writes / scrollToBottom are
    //                    in flight; masks the *re-stick* branch of onScroll so a
    //                    repaint collapse can't be mistaken for a user gesture.
    //                    Scroll-*up* is never masked (repaints collapse toward
    //                    the bottom, never away), so the user can pin mid-burst.
    let stick = true;
    let userPinnedUp = false;
    let scrollGuard = 0;
    let jumpBtn: HTMLButtonElement | null = null;

    // Defer open until container has dimensions (avoids "dimensions" crash on first render)
    const openTimer = setTimeout(() => {
      try {
        term.open(container);
        fit.fit();
        term.focus();
      } catch { return; }

      // Lightweight "jump to latest" affordance — pure DOM, no React re-render,
      // no keybar involvement. Visible only while the user is pinned up; one tap
      // resumes follow. Positioned inside the container (made relative below).
      const syncJumpBtn = () => {
        if (jumpBtn) jumpBtn.style.display = userPinnedUp ? "block" : "none";
      };
      try {
        if (!container.style.position) container.style.position = "relative";
        jumpBtn = document.createElement("button");
        jumpBtn.textContent = "↓ latest";
        jumpBtn.setAttribute("aria-label", "Jump to latest output");
        jumpBtn.style.cssText =
          "position:absolute;right:12px;bottom:12px;z-index:5;display:none;" +
          "padding:4px 11px;font:500 12px/1.2 Inter,system-ui,sans-serif;" +
          "color:#0a0a0f;background:#22d3ee;border:none;border-radius:9999px;" +
          "box-shadow:0 2px 8px rgba(0,0,0,.45);cursor:pointer;opacity:.92;";
        jumpBtn.onclick = () => {
          stick = true;
          userPinnedUp = false;
          scrollGuard++;
          try { term.scrollToBottom(); } catch {}
          scrollGuard--;
          syncJumpBtn();
          if (!readOnly) term.focus();
        };
        container.appendChild(jumpBtn);
      } catch {}

      // Follow state tracks *user* scrolls. A scroll away from the bottom is
      // always a real "hold here" intent (repaints collapse toward the bottom,
      // never away), so it pins durably. A scroll *to* the bottom resumes follow
      // ONLY when scrollGuard is clear — during our own writes/scrollToBottom a
      // content-driven collapse also lands at the bottom, and must not silently
      // re-stick under a user who deliberately scrolled up.
      scrollSub = term.onScroll(() => {
        const b = term.buffer.active;
        const atBottom = b.viewportY >= b.baseY - 1;
        if (atBottom) {
          if (scrollGuard > 0) return;
          stick = true;
          userPinnedUp = false;
        } else {
          stick = false;
          userPinnedUp = true;
        }
        syncJumpBtn();
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
              // wherever tmux's repaint left the viewport — unless the user has
              // already scrolled up (durable intent wins over the reset).
              if (!userPinnedUp) {
                stick = true;
                requestAnimationFrame(() => {
                  scrollGuard++;
                  try { term.scrollToBottom(); } catch {}
                  scrollGuard--;
                });
              }
            }
            if (msg.type === "detached") {
              term.write("\r\n\x1b[33m[session detached]\x1b[0m\r\n");
            }
          } catch {}
        } else {
          // Binary PTY data → render in xterm.js. Follow the bottom only if we
          // were sticking AND the user hasn't pinned up. scrollGuard is held
          // across the write so the onScroll that the write's repaint (and our
          // scrollToBottom) emits can't flip follow back on under a user who
          // scrolled up to read history.
          const wasFollowing = stick && !userPinnedUp;
          scrollGuard++;
          term.write(new Uint8Array(e.data), () => {
            if (wasFollowing) { try { term.scrollToBottom(); } catch {} }
            scrollGuard--;
            syncJumpBtn();
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
      jumpBtn?.remove();
      ws?.close();
      if (wsRef.current === ws) wsRef.current = null;
      term.dispose();
    };
  }, [target]);

  return <div ref={containerRef} className="w-full h-full" />;
});
