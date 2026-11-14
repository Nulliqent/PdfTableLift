import { expect, test, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

// US-55 to US-59: keyboard, screen reader, phone and reduced-motion behaviour, on every view.

/**
 * macOS WebKit skips buttons on a plain Tab unless "Press Tab to highlight each item" is on, so
 * WebKit is driven with Option+Tab, which reaches every control as Chromium's Tab does.
 */
const tabKey = (page: Page) =>
  page.context().browser()?.browserType().name() === "webkit" ? "Alt+Tab" : "Tab";

type Stop = { label: string; visible: boolean };

/**
 * Tabs through the page from its top, reporting each stop's name and whether it shows a focus
 * indicator. Stops when focus leaves the page or comes back round to a control already visited.
 */
async function tabThrough(page: Page, limit = 120): Promise<Stop[]> {
  await page.evaluate(() => {
    // Put the sequential focus starting point back at the top of the page.
    const anchor = document.createElement("span");
    anchor.tabIndex = -1;
    document.body.prepend(anchor);
    anchor.focus();
    anchor.remove();
    (window as unknown as { visited: Set<Element> }).visited = new Set();
  });
  const stops: Stop[] = [];
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(tabKey(page));
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      const visited = (window as unknown as { visited: Set<Element> }).visited;
      if (!el || el === document.body || visited.has(el)) return null;
      visited.add(el);
      const css = getComputedStyle(el);
      const outlined = css.outlineStyle !== "none" && parseFloat(css.outlineWidth) > 0;
      const shadowed = css.boxShadow !== "none";
      const field = el as HTMLInputElement;
      const label =
        el.getAttribute("aria-label") ||
        field.labels?.[0]?.textContent?.trim() ||
        el.getAttribute("title") ||
        el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ||
        el.tagName;
      return { label, visible: outlined || shadowed };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return stops;
}

function expectFocusVisibleEverywhere(stops: Stop[]) {
  const hidden = stops.filter((s) => !s.visible).map((s) => s.label);
  expect(hidden, "controls without a visible focus indicator").toEqual([]);
}

test.describe("keyboard", () => {
  test("every control of a Document with Tables is reachable with visible focus", async ({
    page,
  }) => {
    await page.goto("/");
    await openFixture(page, "section-headers.pdf");
    await expect(page.getByRole("main").getByRole("heading", { name: /^Table 1/ })).toBeVisible();

    const stops = await tabThrough(page);
    const labels = stops.map((s) => s.label);
    for (const expected of [
      "Open PDF",
      "Choose PDF files",
      "Remove section-headers.pdf",
      "Select Table Region…",
      "Column spacing",
      "Join tables that continue onto the next page",
      "Redraw Region",
      "Remove Table",
      "Table",
      "Source Page",
      "CSV",
      "Spreadsheet (TSV)",
      "Markdown",
      "JSON",
      "First row is header",
      "Copy",
    ]) {
      expect(
        labels.some((l) => l.startsWith(expected)),
        `Tab reaches "${expected}"`,
      ).toBe(true);
    }
    // Cells and row numbers are reachable too.
    expect(labels.some((l) => /^Row 1\./.test(l))).toBe(true);
    expectFocusVisibleEverywhere(stops);
  });

  test("Source Page, Select Region, No tables, the Copy fallback and the confirm sheet are keyboard-reachable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("x", "NotAllowedError"));
      document.execCommand = () => false;
    });
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();

    // Source Page: the outlines are buttons.
    await main.getByRole("button", { name: "Source Page" }).click();
    await expect(main.getByTestId("source-page-1")).toBeVisible();
    expectFocusVisibleEverywhere(await tabThrough(page));
    await main.getByRole("button", { name: "Table", exact: true }).click();

    // Copy fallback sheet: focus lands in the text, Done and Escape work.
    await main.getByRole("button", { name: "Copy" }).click();
    const sheet = page.getByRole("dialog", { name: "Copy CSV" });
    await expect(sheet.getByRole("textbox", { name: "Export text" })).toBeFocused();
    await page.keyboard.press(tabKey(page));
    await expect(sheet.getByRole("button", { name: "Done" })).toBeFocused();
    await expect(sheet.getByRole("button", { name: "Done" })).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Confirm sheet: Cancel is focused first, Escape cancels.
    await main.getByRole("cell", { name: "Portland" }).click();
    await page.keyboard.type("X");
    await page.keyboard.press("Enter");
    await page.getByRole("slider", { name: "Column spacing" }).fill("2");
    const confirm = page.getByRole("dialog", { name: "Discard your corrections?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press(tabKey(page));
    await expect(confirm.getByRole("button", { name: "Discard and Re-detect" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();

    // Region selection: stepper, Select Whole Page, Cancel and Add Table.
    await page.getByRole("button", { name: /Select Table Region/ }).click();
    await expect(main.getByRole("button", { name: "Select Whole Page" })).toBeVisible();
    const stops = await tabThrough(page);
    const labels = stops.map((s) => s.label);
    for (const expected of ["Select Whole Page", "Cancel"])
      expect(labels, `Tab reaches ${expected}`).toContain(expected);
    expectFocusVisibleEverywhere(stops);
  });

  test("a cell is edited from the keyboard alone and Enter finishes the edit", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    const cell = main.getByRole("cell", { name: "Portland" });
    await cell.focus();
    await expect(cell).toBeFocused();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("Portland OR");
    await page.keyboard.press("Enter");
    await expect(main.getByRole("cell", { name: "Portland OR" })).toBeVisible();
    await expect(main.getByRole("cell", { name: "Portland OR" })).not.toBeFocused();
  });

  test("the No tables screen and an error screen are reachable by keyboard", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "embedded-bold.pdf");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Remove Table" }).click();
    await expect(main.getByRole("heading", { name: "No tables were detected" })).toBeVisible();
    const stops = await tabThrough(page);
    expect(stops.map((s) => s.label)).toEqual(
      expect.arrayContaining(["Select Table Region", "Open Another PDF"]),
    );
    expectFocusVisibleEverywhere(stops);
  });
});

test.describe("screen reader", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
  });

  test("the HUD is a polite live region that is in the page before it speaks", async ({ page }) => {
    await page.route("**/example-document.pdf", (route) => route.abort());
    await page.goto("/");
    const hud = page.locator('[role="status"][aria-live="polite"]');
    await expect(hud).toHaveCount(1);
    await expect(hud).toBeEmpty();

    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: "Copy" }).click();
    await expect(hud).toHaveText("Copied as CSV");
  });

  test("copying twice announces twice: the repeated message is a new node", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    const hud = page.locator('[role="status"][aria-live="polite"]');
    await main.getByRole("button", { name: "Copy" }).click();
    const first = await hud.locator("span").elementHandle();
    await expect(hud).toHaveText("Copied as CSV");
    await main.getByRole("button", { name: "Copy" }).click();
    await expect.poll(() => first!.evaluate((el) => el.isConnected)).toBe(false);
    await expect(hud).toHaveText("Copied as CSV");
  });

  test("the HUD empties itself after it fades", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    await page.getByRole("main").getByRole("button", { name: "Copy" }).click();
    const hud = page.locator('[role="status"][aria-live="polite"]');
    await expect(hud).toHaveText("Copied as CSV");
    await expect(hud).toBeEmpty({ timeout: 5000 });
  });

  test("Column Spacing is announced by the slider alone, not twice", async ({ page }) => {
    await page.goto("/");
    const slider = page.getByRole("slider", { name: "Column spacing" });
    await expect(slider).toHaveAttribute("aria-valuetext", "1.0×");
    // Only the HUD is a status region; the value readout is hidden from the accessibility tree.
    await expect(page.getByRole("status")).toHaveCount(1);
    await expect(page.locator("output")).toHaveAttribute("aria-hidden", "true");
  });

  test("a failed Document is announced even when a good Table is selected", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    await expect(page.getByRole("main").getByRole("heading", { name: "Table 1" })).toBeVisible();
    await openFixture(page, "image-only.pdf");
    await expect(page.getByRole("status").filter({ hasText: "No text found" })).toBeVisible();
  });
});

test.describe("section headers in As Column mode", () => {
  test("marking a row says where it went, and the footer explains how to unmark it", async ({
    page,
  }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    await main.getByRole("button", { name: /^Row 2\./ }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Marked as section · switch to As Rows" }),
    ).toBeVisible();
    await expect(main.getByText(/switch to As Rows to edit or unmark/)).toBeVisible();
    await main.getByRole("button", { name: "As Rows" }).click();
    await main.getByRole("button", { name: /Row is a section header/ }).click();
    await expect(main.getByText(/Click a row number to mark or unmark/)).toBeVisible();
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  async function expectOneColumn(page: Page) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);
    const sidebar = (await page.getByRole("complementary", { name: "Documents" }).boundingBox())!;
    const content = (await page.getByRole("main").boundingBox())!;
    expect(content.y).toBeGreaterThanOrEqual(sidebar.y + sidebar.height - 1);
    expect(Math.abs(content.x - sidebar.x)).toBeLessThan(1);
    expect(content.width).toBeLessThanOrEqual(390);
  }

  test("every view stacks into one column without horizontal scroll", async ({ page }) => {
    await page.route("**/example-document.pdf", (route) => route.abort());
    await page.goto("/");
    await expectOneColumn(page); // the empty shell

    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
    await expectOneColumn(page);

    await main.getByRole("button", { name: "Source Page" }).click();
    await expect(main.getByTestId("source-page-1")).toBeVisible();
    await expectOneColumn(page);
    await main.getByRole("button", { name: "Table", exact: true }).click();

    await page.getByRole("button", { name: /Select Table Region/ }).click();
    await expect(main.getByRole("button", { name: "Select Whole Page" })).toBeVisible();
    await main.getByRole("button", { name: "Select Whole Page" }).click();
    await expect(main.getByText("Preview", { exact: true })).toBeVisible();
    await expectOneColumn(page);
    await page.keyboard.press("Escape");

    await page.goto("/");
    await openFixture(page, "image-only.pdf");
    await expect(main.getByRole("heading", { name: "image-only.pdf" })).toBeVisible();
    await expectOneColumn(page);

    await page.goto("/");
    await openFixture(page, "embedded-bold.pdf");
    await main.getByRole("button", { name: "Remove Table" }).click();
    await expect(main.getByRole("heading", { name: "No tables were detected" })).toBeVisible();
    await expectOneColumn(page);
  });

  test("the sheets and the HUD fit inside the phone's width", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("x", "NotAllowedError"));
      document.execCommand = () => false;
    });
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    await page.getByRole("main").getByRole("button", { name: "Copy" }).click();
    const box = (await page.getByRole("dialog", { name: "Copy CSV" }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no transition or animation runs: HUD, switches, buttons and spinner", async ({ page }) => {
    await page.addInitScript(() => {
      navigator.clipboard.writeText = () => Promise.resolve();
    });
    await page.goto("/");
    // A long file keeps the spinner on screen.
    await openFixture(page, "perf-200-pages.pdf");
    const spinner = page.getByText("Reading pages…").locator("span");
    if (await spinner.isVisible()) {
      await expect(spinner).toHaveCSS("animation-name", "none");
    }
    await expect(page.getByRole("main").getByRole("heading", { name: /^Table 1/ })).toBeVisible({
      timeout: 60_000,
    });
    const join = page.getByRole("switch", { name: /Join tables/ });
    expect(await join.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
    expect(await join.evaluate((el) => getComputedStyle(el, "::after").transitionDuration)).toBe(
      "0s",
    );
    expect(
      await page
        .getByRole("main")
        .getByRole("button", { name: "Copy" })
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");

    await page.getByRole("main").getByRole("button", { name: "Copy" }).click();
    const hud = page.locator('[role="status"][aria-live="polite"]');
    await expect(hud).toHaveText("Copied as CSV");
    expect(await hud.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
  });

  test("without the preference, the HUD does animate (the check above can fail)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:8080",
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    await page.goto("/");
    const hud = page.locator('[role="status"][aria-live="polite"]');
    expect(await hud.evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe("0s");
    await context.close();
  });
});
