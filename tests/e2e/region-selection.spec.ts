import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

/** Fractions of the page box, from its top left. */
type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Drags a Region over the page with the mouse. */
async function dragWithMouse(page: Page, layer: Locator, r: Rect) {
  const b = (await layer.boundingBox())!;
  await page.mouse.move(b.x + b.width * r.x0, b.y + b.height * r.y0);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * ((r.x0 + r.x1) / 2), b.y + b.height * ((r.y0 + r.y1) / 2));
  await page.mouse.move(b.x + b.width * r.x1, b.y + b.height * r.y1);
  await page.mouse.up();
}

async function enterSelectRegion(page: Page, fixture: string) {
  await page.goto("/");
  await openFixture(page, fixture);
  await expect(page.getByRole("main").getByRole("heading", { name: /^Table 1/ })).toBeVisible();
  await page.getByRole("button", { name: /Select Table Region/ }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Select Table Region" })).toBeVisible();
  const layer = main.getByLabel("Drag to select a table region");
  await expect(layer).toBeVisible();
  return { main, layer };
}

// Both Tables of this page, and everything between them.
// A tall window, so the whole page is on screen and can be dragged over with the mouse.
test.use({ viewport: { width: 1280, height: 1600 } });

const aroundBothTables: Rect = { x0: 0.05, y0: 0.07, x1: 0.95, y1: 0.35 };
const blankArea: Rect = { x0: 0.1, y0: 0.8, x1: 0.9, y1: 0.95 };

test("drag a Region with the mouse, see the preview, and save a Hand-drawn Table", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page, "separate-tables.pdf");
  await expect(main.getByText("Nothing selected yet")).toBeVisible();
  await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();

  await dragWithMouse(page, layer, aroundBothTables);

  await expect(main.getByText("Preview", { exact: true })).toBeVisible();
  await expect(main.getByRole("columnheader", { name: "Store" })).toBeVisible();
  await main.getByRole("button", { name: "Add Table" }).click();

  // Back on the Table view: one Hand-drawn Table took over both Detected Tables.
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByText("Selected by hand")).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(1);
  await expect(sidebar.getByRole("button", { name: /Selected by hand/ })).toBeVisible();
});

test("a Region with no text says so and cannot be saved", async ({ page }) => {
  const { main, layer } = await enterSelectRegion(page, "separate-tables.pdf");

  await dragWithMouse(page, layer, blankArea);

  await expect(main.getByText("No text in this area")).toBeVisible();
  await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();
});

test("Escape and Cancel leave Region selection with no changes", async ({ page }) => {
  const { main, layer } = await enterSelectRegion(page, "separate-tables.pdf");
  await dragWithMouse(page, layer, aroundBothTables);
  await page.keyboard.press("Escape");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByText("Selected by hand")).toHaveCount(0);
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(2);

  await sidebar.getByRole("button", { name: /Select Table Region/ }).click();
  await main.getByRole("button", { name: "Cancel" }).click();
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(2);
});

test("Select Whole Page works from the keyboard, and the stepper reaches every page", async ({
  page,
}) => {
  const { main } = await enterSelectRegion(page, "repeated-header.pdf");
  await expect(main.getByText("Page 1 of 3")).toBeVisible();
  await main.getByRole("button", { name: "Next page" }).click();
  await main.getByRole("button", { name: "Next page" }).click();
  await expect(main.getByText("Page 3 of 3")).toBeVisible();
  await expect(main.getByRole("button", { name: "Next page" })).toBeDisabled();

  await main.getByRole("button", { name: "Select Whole Page" }).focus();
  await page.keyboard.press("Enter");
  await expect(main.getByText("Preview", { exact: true })).toBeVisible();
  await main.getByRole("button", { name: "Add Table" }).focus();
  await page.keyboard.press("Enter");

  await expect(main.getByText("Selected by hand")).toBeVisible();
  await expect(main.getByText("Page 3 of 3")).toBeVisible();
});

test("moving Column Spacing updates the preview while a Region is drawn", async ({ page }) => {
  const { main } = await enterSelectRegion(page, "spaced-strings-pdfkit.pdf");
  await main.getByRole("button", { name: "Select Whole Page" }).click();
  const columns = main.getByRole("columnheader");
  await expect(columns).toHaveCount(3);

  await page.getByRole("slider", { name: "Column spacing" }).fill("2.6");

  await expect(columns).toHaveCount(2);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 900 } });

  async function touchOn(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    return (type: "touchStart" | "touchMove" | "touchEnd", p?: { x: number; y: number }) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [p] : [] });
  }

  test("a finger swipe that starts on the page scrolls instead of drawing", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Playwright can only send touch drags through Chromium");
    const { main, layer } = await enterSelectRegion(page, "separate-tables.pdf");
    await layer.scrollIntoViewIfNeeded();
    const touch = await touchOn(page);
    const b = (await layer.boundingBox())!;
    const x = b.x + b.width / 2;
    // The page was scrolled to the end to reach it, so a downward swipe scrolls back up.
    const before = await page.evaluate(() => window.scrollY);

    await touch("touchStart", { x, y: b.y + b.height * 0.2 });
    for (let i = 1; i <= 8; i++) await touch("touchMove", { x, y: b.y + b.height * 0.2 + i * 25 });
    await touch("touchEnd");

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(before - 50);
    await expect(main.getByText("Nothing selected yet")).toBeVisible();
  });

  test("drag a Region with a finger after turning Draw on, once per tap", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "Playwright can only send touch drags through Chromium");
    const { main, layer } = await enterSelectRegion(page, "separate-tables.pdf");
    const draw = main.getByRole("button", { name: "Draw" });
    await expect(draw).toHaveAttribute("aria-pressed", "false");
    await draw.click();
    await expect(draw).toHaveAttribute("aria-pressed", "true");
    // The sidebar stacks above the content on a phone, so bring the page into view first.
    await layer.scrollIntoViewIfNeeded();
    const b = (await layer.boundingBox())!;
    const at = (fx: number, fy: number) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
    const touch = await touchOn(page);

    await touch("touchStart", at(aroundBothTables.x0, aroundBothTables.y0));
    await touch("touchMove", at(0.5, 0.2));
    await touch("touchMove", at(aroundBothTables.x1, aroundBothTables.y1));
    await touch("touchEnd");

    await expect(main.getByText("Preview", { exact: true })).toBeVisible();
    await expect(main.getByRole("columnheader", { name: "Store" })).toBeVisible();
    // Drawing ends with the drag, so the next swipe scrolls again.
    await expect(draw).toHaveAttribute("aria-pressed", "false");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    await main.getByRole("button", { name: "Add Table" }).click();
    await expect(main.getByText("Selected by hand")).toBeVisible();
  });
});

test("the Draw toggle is for fingers only: it is absent with a mouse", async ({ page }) => {
  const { main } = await enterSelectRegion(page, "separate-tables.pdf");
  await expect(main.getByRole("button", { name: "Draw" })).toBeHidden();
});
