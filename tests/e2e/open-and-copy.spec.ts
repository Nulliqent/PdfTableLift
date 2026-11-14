import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("open a PDF, see its Detected Tables and copy one as CSV", async ({
  page,
  context,
  browserName,
}) => {
  // WebKit can't grant clipboard-read, so there the test records what the page writes instead.
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const written: string[] = [];
    Object.assign(window, { clipboardWrites: written });
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text: string) => {
      written.push(text);
      return write(text);
    };
  });
  await page.goto("/");

  await openFixture(page, "separate-tables.pdf");

  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(sidebar.getByText("separate-tables.pdf")).toBeVisible();
  const first = sidebar.getByRole("button", { name: /Table 1/ });
  const second = sidebar.getByRole("button", { name: /Table 2/ });
  await expect(first).toContainText("Page 1 · 3 × 4");
  await expect(second).toContainText("Page 1 · 3 × 3");
  await expect(first).toHaveAttribute("aria-current", "true");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await expect(main.getByRole("columnheader", { name: "Store" })).toBeVisible();

  await second.click();
  await expect(main.getByRole("heading", { name: "Table 2" })).toBeVisible();
  await expect(second).toHaveAttribute("aria-current", "true");

  await main.getByRole("button", { name: "Copy" }).click();

  // The HUD is a live region, so the confirmation is announced.
  await expect(page.getByRole("status").filter({ hasText: "Copied as CSV" })).toBeVisible();
  const expected = "Team,Staff,Open roles\nEngineering,42,6\nSupport,18,2\nSales,25,4";
  const written = await page.evaluate(
    () => (window as unknown as { clipboardWrites: string[] }).clipboardWrites,
  );
  expect(written).toEqual([expected]);
  if (browserName === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});
