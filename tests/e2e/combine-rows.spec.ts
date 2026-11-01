import { expect, test, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

// section-headers.pdf, As Rows: Store/Manager/Q1/Q2, then West, Portland, Seattle, Central,
// Denver, Omaha, East, Boston, Raleigh (West, Central and East are Section Headers).
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
  await openFixture(page, "section-headers.pdf");
  await page.getByRole("main").getByRole("button", { name: "As Rows" }).click();
});

const lastCopy = async (page: Page) => {
  await page.getByRole("main").getByRole("button", { name: "Copy" }).click();
  return page.evaluate(() =>
    (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1),
  );
};

const tableRow = (page: Page) =>
  page.getByRole("complementary", { name: "Documents" }).getByRole("button", { name: /Table 1/ });

test("Combine with Row below, by mouse", async ({ page }) => {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await page
    .getByRole("menu", { name: "Row 1" })
    .getByRole("menuitem", { name: "Combine with Row below" })
    .click();
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Rows combined");
  await expect(main.getByRole("cell", { name: "Portland Seattle" })).toBeVisible();
  await expect(tableRow(page)).toContainText("5 × 4");
  expect(await lastCopy(page)).toMatch(
    /^Store,Manager,Q1,Q2\nWest,,,\nPortland Seattle,A\. Rivera J\. Chen,412\.8 455\.0,430\.1 470\.3\nCentral,,,\n/,
  );
});

test("the last Row cannot be combined with a Row below", async ({ page }) => {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: /^Row 6\./ }).click();
  const menu = page.getByRole("menu", { name: "Row 6" });
  const below = menu.getByRole("menuitem", { name: "Combine with Row below" });
  await expect(below).toHaveAttribute("aria-disabled", "true");
  await expect(menu.getByRole("menuitem", { name: "Combine with Row above" })).not.toHaveAttribute(
    "aria-disabled",
  );
  // Playwright waits for an aria-disabled item to become enabled; force the click through.
  await below.click({ force: true });
  await expect(menu).toBeVisible();
  await expect(tableRow(page)).toContainText("6 × 4");
});

test("Combine with Row above, by keyboard, unmarks the Section Header above", async ({ page }) => {
  const main = page.getByRole("main");
  const denver = main.getByRole("button", { name: /^Row 3\./ });
  await denver.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Row 3" });
  await expect(menu.getByRole("menuitem", { name: "Mark as Section Header" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Combine with Row above" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Rows combined");
  await expect(tableRow(page)).toContainText("2 sections");
  await expect(main.getByRole("cell", { name: "Central Denver" })).toBeVisible();
  // Focus comes back to the combined Row's row number.
  await expect(main.getByRole("button", { name: /^Row 3\./ })).toBeFocused();
  expect(await lastCopy(page)).toContain(
    "\nSeattle,J. Chen,455.0,470.3\nCentral Denver,M. Okafor,",
  );
});

test("re-detecting asks first, then discards the Combine", async ({ page }) => {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await page.getByRole("menuitem", { name: "Combine with Row below" }).click();
  await expect(main.getByRole("cell", { name: "Portland Seattle" })).toBeVisible();

  await page.getByRole("slider", { name: "Column spacing" }).fill("1.2");
  const dialog = page.getByRole("dialog", { name: "Discard your corrections?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard and Re-detect" }).click();
  await expect(main.getByRole("cell", { name: "Portland Seattle" })).toHaveCount(0);
  await expect(main.getByRole("cell", { name: "Portland", exact: true })).toBeVisible();
});

test("Combine then Split back, by mouse", async ({ page }) => {
  const main = page.getByRole("main");
  const before = await lastCopy(page);
  await main.getByRole("button", { name: /^Row 1\./ }).click();
  const menu = page.getByRole("menu", { name: "Row 1" });
  // Only a combined Row offers Split back.
  await expect(menu.getByRole("menuitem")).toHaveCount(3);
  await expect(menu.getByRole("menuitem", { name: "Split back" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Combine with Row below" }).click();
  await expect(main.getByRole("cell", { name: "Portland Seattle" })).toBeVisible();

  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await menu.getByRole("menuitem", { name: "Split back" }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Split back");
  await expect(main.getByRole("cell", { name: "Portland", exact: true })).toBeVisible();
  await expect(main.getByRole("cell", { name: "Seattle", exact: true })).toBeVisible();
  await expect(tableRow(page)).toContainText("6 × 4");
  expect(await lastCopy(page)).toBe(before);

  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await expect(menu.getByRole("menuitem", { name: "Split back" })).toHaveCount(0);
});

test("Split back, by keyboard, marks the Section Header again", async ({ page }) => {
  const main = page.getByRole("main");
  const before = await lastCopy(page);
  await main.getByRole("button", { name: /^Row 3\./ }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(main.getByRole("cell", { name: "Central Denver" })).toBeVisible();
  await expect(tableRow(page)).toContainText("2 sections");

  await expect(main.getByRole("button", { name: /^Row 3\./ })).toBeFocused();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Row 3" });
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Split back" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Split back");
  await expect(tableRow(page)).toContainText("3 sections");
  await expect(main.getByRole("cell", { name: "Denver", exact: true })).toBeVisible();
  // Focus goes to the upper restored Row's number: Central (grid row 4), a Section Header again.
  const central = main.locator('button[data-row="4"]');
  await expect(central).toHaveAccessibleName("Row is a Section Header. Row actions");
  await expect(central).toBeFocused();
  expect(await lastCopy(page)).toBe(before);
});

test("two Combines are split back in two steps", async ({ page }) => {
  const main = page.getByRole("main");
  const before = await lastCopy(page);
  const choose = async (row: RegExp, item: string) => {
    await main.getByRole("button", { name: row }).click();
    await page.getByRole("menuitem", { name: item }).click();
  };
  await choose(/^Row 4\./, "Combine with Row above");
  await expect(main.getByRole("cell", { name: "Denver Omaha" })).toBeVisible();
  await choose(/^Row 3\./, "Combine with Row above");
  await expect(main.getByRole("cell", { name: "Central Denver Omaha" })).toBeVisible();
  await expect(tableRow(page)).toContainText("2 sections");

  await choose(/^Row 3\./, "Split back");
  await expect(page.getByRole("status")).toHaveText("Split back");
  await expect(main.getByRole("cell", { name: "Denver Omaha" })).toBeVisible();
  await expect(tableRow(page)).toContainText("3 sections");

  await choose(/^Row 3\./, "Split back");
  await expect(main.getByRole("cell", { name: "Omaha", exact: true })).toBeVisible();
  await expect(main.getByRole("cell", { name: "Denver Omaha" })).toHaveCount(0);
  expect(await lastCopy(page)).toBe(before);
});

test("Split back loses edits made to the combined Row", async ({ page }) => {
  const main = page.getByRole("main");
  const before = await lastCopy(page);
  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await page.getByRole("menuitem", { name: "Combine with Row below" }).click();
  await main.getByRole("cell", { name: "Portland Seattle" }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Tacoma");
  await page.keyboard.press("Enter");
  await expect(main.getByRole("cell", { name: "Tacoma" })).toBeVisible();

  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await page.getByRole("menuitem", { name: "Split back" }).click();
  await expect(main.getByRole("cell", { name: "Tacoma" })).toHaveCount(0);
  await expect(main.getByRole("cell", { name: "Portland", exact: true })).toBeVisible();
  expect(await lastCopy(page)).toBe(before);
});

test("the Header Row's menu offers only Combine with Row below until it is combined", async ({
  page,
}) => {
  const main = page.getByRole("main");
  await expect(main.getByRole("switch", { name: "First row is header" })).toBeChecked();
  const header = main.getByRole("button", { name: "Header Row. Row actions" });
  await header.click();
  const menu = page.getByRole("menu", { name: "Header Row" });
  // Marking and Combine with Row above don't apply to the Header Row.
  await expect(menu.getByRole("menuitem")).toHaveText(["Combine with Row below"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(header).toBeFocused();
});

test("a Row combined into the Header Row is split back from the Header Row's menu", async ({
  page,
}) => {
  const main = page.getByRole("main");
  const before = await lastCopy(page);
  // West, the first Row under the Header Row, is a Section Header.
  await main
    .getByRole("button", { name: /^Row is a Section Header/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Combine with Row above" }).click();
  await expect(main.getByRole("columnheader", { name: "Store West" })).toBeVisible();
  await expect(tableRow(page)).toContainText("2 sections");
  // Focus lands on the combined Row's number: the Header Row's.
  const header = main.getByRole("button", { name: "Header Row. Row actions" });
  await expect(header).toBeFocused();

  // By keyboard, as on any other row number.
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Header Row" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Combine with Row below", "Split back"]);
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: "Split back" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Split back");
  await expect(main.getByRole("columnheader", { name: "Store", exact: true })).toBeVisible();
  await expect(tableRow(page)).toContainText("3 sections");
  await expect(header).toBeFocused();
  expect(await lastCopy(page)).toBe(before);
});
