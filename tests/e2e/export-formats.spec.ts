import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

const csv = "Team,Staff,Open roles\nEngineering,42,6\nSupport,18,2\nSales,25,4";

test("a blocked clipboard shows the export text pre-selected in a sheet", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("blocked", "NotAllowedError"));
    document.execCommand = () => false;
  });
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  await page
    .getByRole("complementary", { name: "Documents" })
    .getByRole("button", { name: /Table 2/ })
    .click();

  await main.getByRole("button", { name: "Copy" }).click();

  const sheet = page.getByRole("dialog", { name: "Copy CSV" });
  await expect(sheet).toBeVisible();
  const text = sheet.getByRole("textbox", { name: "Export text" });
  await expect(text).toHaveValue(csv);
  await expect(text).toBeFocused();
  const selected = await text.evaluate((el: HTMLTextAreaElement) =>
    el.value.slice(el.selectionStart, el.selectionEnd),
  );
  expect(selected).toBe(csv);

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
});

test("the chosen format is used for Copy and remembered after a reload", async ({ page }) => {
  await page.addInitScript(() => {
    const written: string[] = [];
    Object.assign(window, { clipboardWrites: written });
    navigator.clipboard.writeText = (text: string) => {
      written.push(text);
      return Promise.resolve();
    };
  });
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  const writes = () =>
    page.evaluate(() => (window as unknown as { clipboardWrites: string[] }).clipboardWrites);

  await main.getByRole("button", { name: "Spreadsheet (TSV)" }).click();
  await main.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("status").filter({ hasText: "paste into Numbers" })).toBeVisible();
  expect((await writes()).at(-1)).toBe(
    "Store\tRegion\tQ1\tQ2\nPortland\tWest\t412.8\t430.1\nDenver\tMountain\t388.1\t391.7\nAustin\tSouth\t501.2\t522.9",
  );

  await main.getByRole("button", { name: "JSON" }).click();
  await expect(main.getByRole("button", { name: "JSON" })).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await openFixture(page, "separate-tables.pdf");
  await expect(page.getByRole("main").getByRole("button", { name: "JSON" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
