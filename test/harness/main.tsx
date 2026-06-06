import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { XTerminal } from "../../src/components/XTerminal";

// STALE-WINDOW simulation (?stale=1): suppress xterm's OWN 'scroll' listener on
// the .xterm-viewport so its internal isUserScrolling / ydisp never catch up to
// a DOM scroll. This deterministically recreates the real-mobile race window
// (touch-drag changes scrollTop instantly, but xterm's scroll-driven state
// lags), which in fast headless otherwise self-heals before the bounce sticks.
// A correct fix must hold the viewport via its OWN synchronous DOM correction,
// not by relying on xterm's (here-disabled, in-prod-too-slow) scroll handler.
if (new URLSearchParams(location.search).get("stale") === "1") {
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    this: any,
    type: string,
    ...rest: any[]
  ) {
    if (
      type === "scroll" &&
      this instanceof HTMLElement &&
      this.classList?.contains("xterm-viewport")
    ) {
      return; // drop xterm's scroll self-heal
    }
    return origAdd.call(this, type, ...rest);
  } as any;
}

// ---------------------------------------------------------------------------
// Mock WebSocket — installed BEFORE XTerminal constructs its socket (it does so
// inside a 50ms setTimeout after mount). XTerminal sends an "attach" JSON on
// open; we reply with {type:"attached"} so the component runs its real attach
// path (fit + initial scrollToBottom). PTY data is pushed by the test via
// window.__push* helpers as ArrayBuffer frames, exactly like the live server.
// ---------------------------------------------------------------------------
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  OPEN = 1;
  readyState = 0;
  binaryType = "blob";
  url: string;
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    (window as any).__mockWS = this;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.({});
    }, 0);
  }
  send(data: any) {
    const s = typeof data === "string" ? data : "";
    if (s.includes('"attach"')) {
      setTimeout(() => this._emit(JSON.stringify({ type: "attached" })), 0);
    }
  }
  _emit(data: any) {
    this.onmessage?.({ data });
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
  addEventListener() {}
  removeEventListener() {}
}
(window as any).WebSocket = MockWebSocket as any;

const enc = new TextEncoder();
function emitText(s: string) {
  const ws = (window as any).__mockWS as MockWebSocket | undefined;
  if (!ws) return;
  ws._emit(enc.encode(s).buffer);
}

// Test API ------------------------------------------------------------------
(window as any).__push = (s: string) => emitText(s);

// Seed a big scrollback so there is somewhere to drag up into.
(window as any).__seed = (lines: number) => {
  let out = "";
  for (let i = 1; i <= lines; i++) out += `scrollback line ${i}\r\n`;
  emitText(out);
};

// A streaming write that ADDS a new line (grows the buffer / ybase) — the kind
// that triggers xterm's internal at-bottom auto-follow. This is what bounces a
// scrolled-up mobile user when xterm's user-scroll flag is still stale.
(window as any).__pushline = (n: number) => {
  emitText(`streamed output line ${n}\r\n`);
};

(window as any).__viewport = () =>
  document.querySelector(".xterm-viewport") as HTMLElement | null;

(window as any).__metrics = () => {
  const v = document.querySelector(".xterm-viewport") as HTMLElement | null;
  if (!v) return null;
  return {
    scrollTop: v.scrollTop,
    scrollHeight: v.scrollHeight,
    clientHeight: v.clientHeight,
    maxScrollTop: v.scrollHeight - v.clientHeight,
    distanceFromBottom: v.scrollHeight - v.scrollTop - v.clientHeight,
  };
};

const root = createRoot(document.getElementById("box")!);
root.render(
  createElement(XTerminal, {
    target: "echo",
    onClose: () => {},
    onNavigate: () => {},
    siblings: [],
    onSelectSibling: () => {},
    readOnly: false,
  }),
);
