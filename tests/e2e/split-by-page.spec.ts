import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("Split by Page separates a Joined Table and Join Again rejoins it", async ({ page }) => {
  await page.goto("/");
  await openFixture(page, "section-page-break.pdf");
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary");
  await expect(main.getByText("Joined from 2 pages")).toBeVisible();

  await main.getByRole("button", { name: "Split by Page" }).click();
  await expect(main.getByText("Page 1 of 2")).toBeVisible();
  await expect(sidebar.getByText("Table 2")).toBeVisible();
  await expect(main.getByText("Joined from")).toHaveCount(0);

  await sidebar.getByText("Table 2").click();
  await expect(main.getByText("Split from the table on page 1")).toBeVisible();
  await main.getByRole("button", { name: "Join Again" }).click();
  await expect(main.getByText("Joined from 2 pages")).toBeVisible();
  await expect(sidebar.getByText("Table 2")).toHaveCount(0);
});
