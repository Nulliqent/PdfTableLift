import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("a table that runs across pages is one Joined Table with its pages shown", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "section-page-break.pdf");
  const main = page.getByRole("main");
  const sidebar = page.getByRole("complementary");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Table 2" })).toHaveCount(0);

  // The page range shows in the eyebrow and in the sidebar.
  await expect(main.getByText("Pages 1–2 of 2")).toBeVisible();
  await expect(sidebar.getByText(/Pages 1–2 ·/)).toBeVisible();

  // The Source Page shows every page, each Part outlined and labelled.
  await main.getByRole("button", { name: "Source Page" }).click();
  const first = main.getByTestId("source-page-1").getByRole("button", { name: /part 1 of 2/ });
  const second = main.getByTestId("source-page-2").getByRole("button", { name: /part 2 of 2/ });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(first).toHaveAttribute("aria-current", "true");
});

test("the join switch splits the table, is remembered, and warns before discarding edits", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "section-page-break.pdf");
  const main = page.getByRole("main");
  const join = page.getByRole("switch", { name: "Join tables that continue onto the next page" });
  await expect(join).toBeChecked();

  await join.uncheck();
  await expect(main.getByText("Page 1 of 2")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Table 2")).toBeVisible();

  await page.reload();
  await expect(join).not.toBeChecked();

  // Back on: correcting a cell makes the next toggle ask first.
  await openFixture(page, "section-page-break.pdf");
  await join.check();
  await expect(main.getByText("Pages 1–2 of 2")).toBeVisible();
  const cell = main.getByRole("cell").first();
  await cell.click();
  await page.keyboard.type("X");
  await page.keyboard.press("Enter");

  await join.click(); // not uncheck(): the switch stays on until the user confirms
  const dialog = page.getByRole("dialog", { name: "Discard your corrections?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(join).toBeChecked();
  await expect(main.getByText("Pages 1–2 of 2")).toBeVisible();

  await join.click();
  await dialog.getByRole("button", { name: "Discard and Re-detect" }).click();
  await expect(join).not.toBeChecked();
  await expect(main.getByText("Page 1 of 2")).toBeVisible();
});

test("an unreadable saved join choice falls back to on", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("table-lift.join", "maybe"));
  await page.goto("/");
  await expect(
    page.getByRole("switch", { name: "Join tables that continue onto the next page" }),
  ).toBeChecked();
});
