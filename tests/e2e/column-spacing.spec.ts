import { join } from "node:path";
import { expect, test } from "@playwright/test";

const example = join(import.meta.dirname, "..", "..", "public", "example-document.pdf");

test("moving Column Spacing re-detects the Tables and is remembered", async ({ page }) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Column spacing" });
  await expect(slider).toHaveValue("1");

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Open PDF" }).click();
  await (await chooser).setFiles(example);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByRole("columnheader")).toHaveCount(6);

  await slider.fill("2");
  await expect(page.getByText("2.0×")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByRole("columnheader")).toHaveCount(4);

  await page.reload();
  await expect(page.getByRole("slider", { name: "Column spacing" })).toHaveValue("2");
});

test("an invalid saved Column Spacing falls back to the default", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("table-lift.columnSpacing", "99"));
  await page.goto("/");
  await expect(page.getByRole("slider", { name: "Column spacing" })).toHaveValue("1");
});
