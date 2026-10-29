import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("redrawing a Detected Table opens on its page and replaces it with a Hand-drawn Table", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(2);

  await main.getByRole("button", { name: "Redraw Region" }).click();
  await expect(main.getByRole("heading", { name: "Select Table Region" })).toBeVisible();
  // It opens on the Table's current bounds, so the preview is already there.
  await expect(main.getByText("Preview", { exact: true })).toBeVisible();

  await main.getByRole("button", { name: "Replace Table" }).click();
  await expect(main.getByText("Selected by hand")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(2);
  await expect(sidebar.getByRole("button", { name: /Selected by hand/ })).toHaveCount(1);
});

test("redrawing one page of a Joined Table leaves the other Part on its own", async ({ page }) => {
  await page.goto("/");
  await openFixture(page, "section-page-break.pdf");
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(main.getByText("Pages 1–2 of 2")).toBeVisible();

  await main.getByRole("button", { name: "Redraw Region on Page 2" }).click();
  await expect(main.getByText("Page 2 of 2")).toBeVisible();
  await main.getByRole("button", { name: "Select Whole Page" }).click();
  await main.getByRole("button", { name: "Replace Table" }).click();

  await expect(main.getByText("Selected by hand")).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Table \d/ })).toHaveCount(2);
  await expect(sidebar.getByText(/Pages 1–2 ·/)).toHaveCount(0);
});
