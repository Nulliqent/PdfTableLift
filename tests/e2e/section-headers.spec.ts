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
  await openFixture(page, "section-headers.pdf");
});

const lastCopy = (page: Page) =>
  page.evaluate(() => (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1));

const tableRow = (page: Page) =>
  page.getByRole("complementary", { name: "Documents" }).getByRole("button", { name: /Table 1/ });

test("the sidebar counts sections and As Column is the default", async ({ page }) => {
  const main = page.getByRole("main");
  await expect(tableRow(page)).toContainText("3 sections");
  await expect(main.getByRole("columnheader", { name: "Section" })).toBeVisible();
  await main.getByRole("button", { name: "Copy" }).click();
  expect(await lastCopy(page)).toMatch(/^Section,Store,Manager,Q1,Q2\nWest,Portland,/);
});

test("As Rows keeps the section rows, and the choice is remembered", async ({ page }) => {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "As Rows" }).click();
  await expect(main.getByRole("columnheader", { name: "Section" })).toHaveCount(0);
  await main.getByRole("button", { name: "Copy" }).click();
  expect(await lastCopy(page)).toMatch(/^Store,Manager,Q1,Q2\nWest,,,\nPortland,/);

  await page.reload();
  await openFixture(page, "section-headers.pdf");
  await expect(main.getByRole("button", { name: "As Rows" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("clicking a row number unmarks and marks a Section Header", async ({ page }) => {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "As Rows" }).click();
  await main
    .getByRole("button", { name: "Row is a section header. Treat as a data row" })
    .first()
    .click();
  await expect(tableRow(page)).toContainText("2 sections");

  await main.getByRole("button", { name: "Row 1. Mark as section header" }).click();
  await expect(tableRow(page)).toContainText("3 sections");
});
