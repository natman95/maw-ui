import { test, expect } from "@playwright/test";

// ===========================================================================
// REPRO: dashboard terminal (XTerminal) on MOBILE — "ลากขึ้นได้แต่เด้งกลับล่าง
// ทันที" = user can drag the viewport up but it SNAPS back to the bottom
// immediately while output streams.
//
// Mechanism (verified against @xterm/xterm 5.5.0 source):
//   • XTerminal reads at-bottom from buffer.viewportY (= ydisp) synchronously
//     before each write (XTerminal.tsx:171).
//   • ydisp is only updated by xterm's _handleScroll, which runs on the DOM
//     'scroll' event — and browsers dispatch scroll events ASYNCHRONOUSLY
//     (next frame), NOT synchronously with the scrollTop change a touch-drag
//     produces.
//   • So a streaming write that lands in the same frame as the user's drag
//     reads a STALE viewportY (still == baseY → wasAtBottom TRUE) and the
//     write callback fires term.scrollToBottom() → snap to bottom = the bounce.
//   • claude's Ink TUI streams several writes/sec, so the stale window is hit
//     constantly → every drag-up bounces.
//
// The assertion below reproduces that exact race deterministically: scroll the
// viewport up, then issue streaming repaint writes in the SAME synchronous
// step (before the async scroll event can update ydisp). The viewport must
// stay where the user left it.
// ===========================================================================

test("mobile drag-up during streaming must not bounce back to bottom", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // ?stale=1 → xterm's own scroll listener is suppressed, recreating the
  // real-mobile race window where its internal isUserScrolling/ydisp lag behind
  // the DOM scroll (in fast headless the live listener self-heals and hides the
  // bug). See harness comment.
  await page.goto("http://localhost:5199/?stale=1");
  await page.waitForSelector(".xterm-viewport", { timeout: 10000 });

  // Seed real scrollback so there is somewhere to drag up into.
  await page.evaluate(() => (window as any).__seed(300));
  await page.waitForTimeout(400);

  const start = await page.evaluate(() => (window as any).__metrics());
  expect(errors, `page errors: ${errors.join("; ")}`).toHaveLength(0);
  // There must be genuine scrollback, and the terminal must start tailing at
  // the bottom (component scrollToBottom on attach).
  expect(start.maxScrollTop, "scrollback exists").toBeGreaterThan(200);
  expect(start.distanceFromBottom, "starts at bottom").toBeLessThanOrEqual(3);

  // The race: user drags the viewport to the top, and streaming repaint writes
  // arrive in the same frame (constant while claude streams).
  const after = await page.evaluate(async () => {
    const v = (window as any).__viewport() as HTMLElement;
    v.scrollTop = 0; // dragged all the way up
    // streaming line-adding writes in the same tick → xterm's internal
    // user-scroll flag (set on the async scroll event) is still stale, so its
    // at-bottom auto-follow yanks the viewport back to the new bottom.
    for (let k = 0; k < 8; k++) (window as any).__pushline(k);
    await new Promise((r) => setTimeout(r, 300)); // let write callbacks + renders settle
    return (window as any).__metrics();
  });

  // After the drag, the viewport must remain near where the user left it (top),
  // NOT be yanked back to the bottom. distanceFromBottom ~= maxScrollTop when
  // parked at top; ~= 0 when bounced.
  expect(
    after.distanceFromBottom,
    `viewport snapped back to bottom (bounce). distanceFromBottom=${after.distanceFromBottom}, maxScrollTop=${after.maxScrollTop}`,
  ).toBeGreaterThan(100);
});

// Second case: once the user has returned to the bottom, tailing MUST resume on
// its own (standard-terminal semantics — no lock, no mode). Guards against an
// over-correction that suppresses auto-follow forever.
test("tailing resumes when user returns to the bottom", async ({ page }) => {
  await page.goto("http://localhost:5199/");
  await page.waitForSelector(".xterm-viewport", { timeout: 10000 });
  await page.evaluate(() => (window as any).__seed(300));
  await page.waitForTimeout(400);

  // Park at bottom, then stream lines that add height; viewport must follow.
  const after = await page.evaluate(async () => {
    const v = (window as any).__viewport() as HTMLElement;
    v.scrollTop = v.scrollHeight; // at bottom
    // wait a frame so xterm's ydisp catches up to the bottom
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    for (let k = 0; k < 20; k++) (window as any).__push(`new streamed line ${k}\r\n`);
    await new Promise((r) => setTimeout(r, 300));
    return (window as any).__metrics();
  });

  expect(
    after.distanceFromBottom,
    `tailing did not follow new output. distanceFromBottom=${after.distanceFromBottom}`,
  ).toBeLessThanOrEqual(5);
});
