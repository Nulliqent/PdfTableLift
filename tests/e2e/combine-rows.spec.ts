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
