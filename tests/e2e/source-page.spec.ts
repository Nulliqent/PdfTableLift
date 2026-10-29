import { expect, test, type Locator } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

/** The box as fractions of the page box that holds it. */
async function fractions(outline: Locator, pagebox: Locator) {
  const [o, p] = await Promise.all([outline.boundingBox(), pagebox.boundingBox()]);
  return {
    left: (o!.x - p!.x) / p!.width,
    top: (o!.y - p!.y) / p!.height,
    width: o!.width / p!.width,
    height: o!.height / p!.height,
  };
}

test("view the source page, outline every Detected Table and click an outline to open it", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();

  await main.getByRole("button", { name: "Source Page" }).click();

  const pagebox = main.getByTestId("source-page-1");
  const canvas = pagebox.locator("canvas");
  await expect(canvas).toBeVisible();
  const outline1 = pagebox.getByRole("button", { name: "Table 1" });
  const outline2 = pagebox.getByRole("button", { name: "Table 2" });
  await expect(outline1).toHaveAttribute("aria-current", "true");
  await expect(outline2).not.toHaveAttribute("aria-current", "true");
  // Selected is solid, the other is dashed.
  await expect(outline1).toHaveCSS("border-top-style", "solid");
  await expect(outline2).toHaveCSS("border-top-style", "dashed");
  // The canvas draws something: the page is not blank.
  const inked = await canvas.evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) return true;
    return false;
  });
  expect(inked).toBe(true);

  // Table 1 sits above Table 2, and both lie inside the page.
  const a = await fractions(outline1, pagebox);
  const b = await fractions(outline2, pagebox);
  expect(a.top).toBeLessThan(b.top);
  for (const f of [a, b]) {
    expect(f.left).toBeGreaterThanOrEqual(0);
    expect(f.left + f.width).toBeLessThanOrEqual(1.001);
    expect(f.top + f.height).toBeLessThanOrEqual(1.001);
  }

  await outline2.click();
  await expect(main.getByRole("heading", { name: "Table 2" })).toBeVisible();
  await expect(outline2).toHaveAttribute("aria-current", "true");
  await expect(outline1).not.toHaveAttribute("aria-current", "true");
  await expect(outline2).toHaveCSS("border-top-style", "solid");
});

test("outlines stay on the same spot of the page at any width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Source Page" }).click();
  const pagebox = main.getByTestId("source-page-1");
  const outline = pagebox.getByRole("button", { name: "Table 1" });
  await expect(pagebox.locator("canvas")).toBeVisible();
  const wide = await fractions(outline, pagebox);
  const wideWidth = (await pagebox.boundingBox())!.width;

  // A phone: the page redraws to fit the pane, with no horizontal scroll.
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(async () => {
    const w = (await pagebox.boundingBox())!.width;
    expect(w).toBeLessThan(wideWidth);
    expect(w).toBeLessThanOrEqual(375);
  }).toPass();
  const narrow = await fractions(outline, pagebox);
  expect(narrow.left).toBeCloseTo(wide.left, 2);
  expect(narrow.top).toBeCloseTo(wide.top, 2);
  expect(narrow.width).toBeCloseTo(wide.width, 2);
  expect(narrow.height).toBeCloseTo(wide.height, 2);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
});
