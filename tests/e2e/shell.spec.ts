import { expect, test } from "@playwright/test";

test("the empty app shell renders its toolbar, sidebar and content pane", async ({ page }) => {
  // The Example Document would otherwise fill the shell (see getting-documents-in.spec.ts).
  await page.route("**/example-document.pdf", (route) => route.abort());
  await page.goto("/");

  await expect(page).toHaveTitle("Table Lift");

  const toolbar = page.getByRole("banner");
  await expect(toolbar.getByRole("heading", { level: 1, name: "Table Lift" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Open PDF" })).toBeVisible();

  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(sidebar.getByRole("button", { name: "Choose PDF files" })).toBeVisible();
  await expect(sidebar.getByText("No documents yet")).toBeVisible();
  await expect(sidebar.getByRole("slider", { name: "Column spacing" })).toBeVisible();

  await expect(page.getByRole("main")).toBeVisible();
});
