import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { UniverseBg } from "../../src/components/UniverseBg";

// Mounts the REAL UniverseBg under the REAL ErrorBoundary, the way App.tsx does.
// ?nowebgl=1 makes canvas.getContext() return null for every WebGL flavour —
// the state a phone is in when the browser refuses a new WebGL context.
if (new URLSearchParams(location.search).get("nowebgl") === "1") {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: any[]) {
    if (/webgl/i.test(type)) return null;
    return (orig as any).call(this, type, ...rest);
  } as any;
}

createRoot(document.getElementById("root")!).render(
  createElement(ErrorBoundary, null,
    createElement(UniverseBg),
    createElement("div", { id: "app-ok", style: { position: "relative", zIndex: 1, color: "#fff" } }, "app content"),
  ),
);
