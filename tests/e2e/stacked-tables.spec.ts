import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

// #50: Select Tables, the matching rule's reasons, Stack N Tables and the read-only Stacked Table.
// The Example Document with joining off has Tables 4 and 5 sharing "Store, Lead, FTE, Open roles,
// Notes" on pages 2 and 3; Table 1 has 6 columns and Tables 2 and 3 other titles.

/** Opens the Example Document with joining off, so Tables 4 and 5 stand apart. */
async function exampleUnjoined(page: Page) {
  await page.addInitScript(() => {
    const written: string[] = [];
    Object.assign(window, { clipboardWrites: written });
    navigator.clipboard.writeText = (text: string) => {
      written.push(text);
      return Promise.resolve();
    };
  });
  await page.goto("/");
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByRole("button", { name: /^Table 4/ })).toBeVisible();
  await page
    .getByRole("switch", { name: "Join tables that continue onto the next page" })
    .uncheck();
  await expect(sidebar.getByRole("button", { name: /^Table 5/ })).toBeVisible();
  return { sidebar, main: page.getByRole("main") };
}

const status = (page: Page) => page.getByRole("status");

test("ticking matching Tables and stacking them makes a read-only Stacked Table", async ({
  page,
}) => {
  const { sidebar, main } = await exampleUnjoined(page);
  await sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  const box = (n: number) =>
    sidebar.getByRole("checkbox", { name: new RegExp(`^Table ${n}(?!\\d)`) });
  await expect(box(1)).toBeFocused();
  await expect(sidebar.getByRole("button", { name: "Stack 0 Tables" })).toBeDisabled();

  // Keyboard: Tab to Table 4 and tick it with Space.
  await box(4).focus();
  await page.keyboard.press("Space");
  await expect(box(4)).toBeChecked();
  await expect(status(page)).toHaveText(
    "Ticked Table 4 · 1 Table ticked · 3 Tables don't match its Header Row",
  );

  // The others stay listed, unavailable, with the reason in words.
  await expect(box(1)).toHaveAttribute("aria-disabled", "true");
  await expect(box(1)).toHaveAccessibleDescription("6 columns, not 5");
  await expect(box(2)).toHaveAccessibleDescription("'SKU' instead of 'Store'");
  await expect(sidebar.getByText("'Week' instead of 'Store'")).toBeVisible();
  await box(1).click({ force: true }); // unavailable: the click changes nothing
  await expect(box(1)).not.toBeChecked();
  await expect(sidebar.getByRole("button", { name: "Stack 1 Table" })).toBeDisabled();

  await box(5).focus();
  await page.keyboard.press("Space");
  await expect(status(page)).toHaveText("Ticked Table 5 · 2 Tables ticked");
  const stack = sidebar.getByRole("button", { name: "Stack 2 Tables" });
  await expect(stack).toBeEnabled();
  await stack.focus();
  await page.keyboard.press("Enter");

  await expect(main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();
  await expect(status(page)).toHaveText("Stacked Tables 4, 5 into Stacked Table 1");
  const entry = sidebar.getByRole("button", { name: /^Stacked Table 1\s?Tables 4, 5/ });
  await expect(entry).toHaveAttribute("aria-current", "true");
  await expect(entry).toBeFocused();
  await expect(main.getByText("Read-only. To correct a Cell, edit its Member:")).toBeVisible();

  // One Header Row, both Members' Rows, and no editing or row menus.
  await expect(main.getByRole("columnheader", { name: "Store" })).toHaveCount(1);
  const cell = main.getByRole("cell", { name: "Madison Willy St" });
  await expect(cell).toBeVisible();
  await expect(cell).not.toHaveAttribute("contenteditable");
  await expect(main.getByRole("button", { name: /Row actions/ })).toHaveCount(0);
  await expect(main.getByRole("switch", { name: "First row is header" })).toHaveCount(0);

  await main.getByRole("button", { name: "Copy" }).click();
  const copied = await page.evaluate(() =>
    (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1)!,
  );
  expect(copied.split("\n")[0]).toBe("Section,Store,Lead,FTE,Open roles,Notes");
  expect(copied.match(/Store,Lead/g)).toHaveLength(1);
  expect(copied).toContain("Midwest & Northeast,Madison Willy St,N. Kowalski,6,1,");

  // The Members stay listed and editable on their own.
  await main.getByRole("button", { name: "Table 5", exact: true }).click();
  await expect(main.getByRole("heading", { name: "Table 5" })).toBeVisible();
  await expect(main.getByRole("cell", { name: "Madison Willy St" })).toHaveAttribute(
    "contenteditable",
  );
  await entry.click();
  await expect(main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();
});

test("the Source switch adds each Row's page, and Download saves the same text as Copy", async ({
  page,
}) => {
  const { sidebar, main } = await exampleUnjoined(page);
  await sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  await sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ }).check();
  await sidebar.getByRole("checkbox", { name: /^Table 5(?!\d)/ }).check();
  await sidebar.getByRole("button", { name: "Stack 2 Tables" }).click();
  await expect(main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();

  // Off by default; turned on by keyboard, with its state announced.
  const source = main.getByRole("switch", { name: "Source" });
  await expect(source).not.toBeChecked();
  await expect(main.getByRole("columnheader", { name: "Source" })).toHaveCount(0);
  await source.focus();
  await page.keyboard.press("Space");
  await expect(source).toBeChecked();
  await expect(status(page)).toHaveText("Source column on");
  await expect(main.getByRole("columnheader", { name: "Source" })).toBeVisible();
  await expect(main.getByRole("row", { name: /^\d+ p3 .*Madison Willy St/ })).toBeVisible();

  await main.getByRole("button", { name: "Copy" }).click();
  const copied = await page.evaluate(() =>
    (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1)!,
  );
  expect(copied.split("\n")[0]).toBe("Source,Section,Store,Lead,FTE,Open roles,Notes");
  expect(copied).toContain("p3,Midwest & Northeast,Madison Willy St,N. Kowalski,6,1,");

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Download" }).focus();
  await page.keyboard.press("Enter");
  const file = await download;
  expect(file.suggestedFilename()).toBe("Northwind Q3 Summary.pdf - Stacked Table 1.csv");
  expect(await readFile((await file.path())!, "utf8")).toBe(copied);
  await expect(status(page)).toHaveText("Downloaded");

  await source.focus();
  await page.keyboard.press("Space");
  await expect(status(page)).toHaveText("Source column off");
  await expect(main.getByRole("columnheader", { name: "Source" })).toHaveCount(0);
});

test("Escape and Cancel leave Select Tables without a Stacked Table", async ({ page }) => {
  const { sidebar } = await exampleUnjoined(page);
  const start = sidebar.getByRole("button", { name: /^Select Tables/ });
  await start.click();
  await sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ }).check();
  await sidebar.getByRole("checkbox", { name: /^Table 5(?!\d)/ }).check();
  await page.keyboard.press("Escape");
  await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
  await expect(start).toBeFocused();

  await start.click();
  await expect(sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ })).not.toBeChecked();
  await sidebar.getByRole("button", { name: "Cancel" }).click();
  await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
  await expect(sidebar.getByRole("button", { name: /^Stacked Table/ })).toHaveCount(0);
});

test("unticking the first Table judges the rest against the next one ticked", async ({ page }) => {
  const { sidebar } = await exampleUnjoined(page);
  await sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  const box = (n: number) =>
    sidebar.getByRole("checkbox", { name: new RegExp(`^Table ${n}(?!\\d)`) });
  await box(4).check();
  await expect(box(1)).toHaveAccessibleDescription("6 columns, not 5");
  await box(4).uncheck();
  await expect(box(1)).not.toHaveAttribute("aria-disabled");
  await box(1).check();
  await expect(box(4)).toHaveAccessibleDescription("5 columns, not 6");
  await expect(status(page)).toHaveText(
    "Ticked Table 1 · 1 Table ticked · 4 Tables don't match its Header Row",
  );
});

test("a Table without a Header Row can't be ticked", async ({ page }) => {
  const { sidebar, main } = await exampleUnjoined(page);
  await sidebar.getByRole("button", { name: /^Table 3/ }).click();
  await main.getByRole("switch", { name: "First row is header" }).uncheck();
  await sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  const three = sidebar.getByRole("checkbox", { name: /^Table 3(?!\d)/ });
  await expect(three).toHaveAttribute("aria-disabled", "true");
  await expect(three).toHaveAccessibleDescription("No Header Row");
});
