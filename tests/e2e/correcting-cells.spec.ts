import { expect, test, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const written: string[] = [];
    Object.assign(window, { clipboardWrites: written });
    navigator.clipboard.writeText = (text: string) => {
      written.push(text);
      return Promise.resolve();
    };
  });
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
});

const lastCopy = (page: Page) =>
  page.evaluate(() => (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1));

test("an edited cell flows into the copy; Enter finishes the edit", async ({ page }) => {
  const main = page.getByRole("main");
  const cell = main.getByRole("cell", { name: "Portland" });
  await cell.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Portland OR");
  await page.keyboard.press("Enter");
  await expect(main.getByRole("cell", { name: "Portland OR" })).toBeVisible();
  await expect(main.getByRole("cell", { name: "Portland OR" })).not.toBeFocused();

  await main.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied as CSV" })).toBeVisible();
  expect(await lastCopy(page)).toContain("Portland OR,West,412.8,430.1");
});

test("First row is header turns the Header Row off and back on", async ({ page }) => {
  const main = page.getByRole("main");
  const header = main.getByRole("switch", { name: "First row is header" });
  await expect(header).toBeChecked();
  await expect(main.getByRole("columnheader")).toHaveCount(4);

  await header.uncheck();
  await expect(main.getByRole("columnheader")).toHaveCount(0);
  await main.getByRole("button", { name: "Markdown" }).click();
  await main.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Copied as Markdown" })).toBeVisible();
  expect(await lastCopy(page)).toMatch(/^\| Column 1 \| Column 2 \| Column 3 \| Column 4 \|/);

  await header.check();
  await expect(main.getByRole("columnheader")).toHaveCount(4);
});

test("numeric columns are right-aligned", async ({ page }) => {
  const main = page.getByRole("main");
  const align = (name: string) =>
    main.getByRole("cell", { name }).evaluate((el) => getComputedStyle(el).textAlign);
  expect(await align("412.8")).toBe("right");
  expect(await align("Portland")).not.toBe("right");
});

test("moving Column Spacing over an edited Table asks first", async ({ page }) => {
  const main = page.getByRole("main");
  const slider = page.getByRole("slider", { name: "Column spacing" });
  await main.getByRole("cell", { name: "Portland" }).click();
  await page.keyboard.type("X");
  await page.keyboard.press("Enter");
  await expect(main.getByRole("cell", { name: /X/ })).toBeVisible();

  await slider.fill("2");
  const dialog = page.getByRole("dialog", { name: "Discard your corrections?" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(slider).toHaveValue("1");
  await expect(main.getByRole("cell", { name: /X/ })).toBeVisible();

  await slider.fill("2");
  await dialog.getByRole("button", { name: "Discard and Re-detect" }).click();
  await expect(dialog).toBeHidden();
  await expect(slider).toHaveValue("2");
  await expect(main.getByRole("cell", { name: /X/ })).toHaveCount(0);
  await expect(main.getByRole("cell", { name: "Portland" })).toBeVisible();
});
