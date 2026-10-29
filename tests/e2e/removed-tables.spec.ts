import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("remove a Detected Table, then restore it from the sidebar", async ({ page }) => {
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");

  const sidebar = page.getByRole("complementary", { name: "Documents" });
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();

  await main.getByRole("button", { name: "Remove Table" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Removed Table 1" })).toBeVisible();
  // The other Table is renumbered and selected; the removed one is listed with Restore.
  await expect(sidebar.getByRole("button", { name: /^Table 1/ })).toContainText("3 × 3");
  await expect(sidebar.getByRole("button", { name: /^Table 2/ })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(sidebar.getByText("Removed: Table 1, Page 1")).toBeVisible();

  await sidebar.getByRole("button", { name: /Restore Table 1/ }).click();

  await expect(sidebar.getByRole("button", { name: /^Table 2/ })).toBeVisible();
  await expect(sidebar.getByText(/Removed: Table/)).toHaveCount(0);
});
