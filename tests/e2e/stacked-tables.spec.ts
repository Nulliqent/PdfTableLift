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

/** Stacks Tables 4 and 5 of the Example Document (joining off) into Stacked Table 1. */
async function stackedFourFive(page: Page) {
  const { sidebar, main } = await exampleUnjoined(page);
  await sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  await sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ }).check();
  await sidebar.getByRole("checkbox", { name: /^Table 5(?!\d)/ }).check();
  await sidebar.getByRole("button", { name: "Stack 2 Tables" }).click();
  await expect(main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();
  return { sidebar, main };
}

test("Edit Members reorders by keyboard, removes and adds Members, and Save applies it (#53)", async ({
  page,
}) => {
  const { sidebar, main } = await stackedFourFive(page);
  // As Column: Table 4's first Row is "Portland Pearl"; Table 5's, "Madison Willy St", follows its 17.
  const rows = main.getByRole("row");
  await expect(rows).toHaveCount(28);
  await expect(rows.nth(1)).toContainText("Portland Pearl");
  await expect(rows.nth(18)).toContainText("Madison Willy St");
  const edit = main.getByRole("button", { name: "Edit Members" });
  await edit.focus();
  await page.keyboard.press("Enter");

  const box = (n: number) =>
    sidebar.getByRole("checkbox", { name: new RegExp(`^Table ${n}(?!\\d)`) });
  await expect(
    sidebar.getByRole("group", { name: "Edit Members of Stacked Table 1" }),
  ).toBeVisible();
  await expect(box(4)).toBeChecked();
  await expect(box(5)).toBeChecked();
  // The Members come first, in order.
  await expect(sidebar.getByRole("checkbox").first()).toBeFocused();
  await expect(sidebar.getByRole("checkbox").first()).toHaveAccessibleName(/^Table 4/);

  // Keyboard: Tab to Move Table 5 up and press Enter. The move is announced and focus stays on it.
  const up5 = sidebar.getByRole("button", { name: "Move Table 5 up" });
  await up5.focus();
  await page.keyboard.press("Enter");
  await expect(status(page)).toHaveText("Moved Table 5 up · 1 of 2");
  await expect(up5).toBeFocused();
  await expect(up5).toHaveAttribute("aria-disabled", "true");
  await expect(sidebar.getByRole("checkbox").first()).toHaveAccessibleName(/^Table 5/);
  await page.keyboard.press("Enter"); // already first: nothing moves
  await expect(sidebar.getByRole("checkbox").first()).toHaveAccessibleName(/^Table 5/);
  // The preview only follows on Save.
  await expect(rows.nth(18)).toContainText("Madison Willy St");

  await sidebar.getByRole("button", { name: "Save" }).click();
  await expect(status(page)).toHaveText("Stacked Table 1 now stacks Tables 5, 4");
  await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
  await expect(
    sidebar.getByRole("button", { name: /^Stacked Table 1\s?Tables 5, 4/ }),
  ).toBeFocused();
  await expect(rows.nth(1)).toContainText("Madison Willy St");
  await expect(rows).toHaveCount(28);

  // Untick Table 4: one Member still stands. Untick both: Save is disabled with a reason.
  await edit.click();
  await box(4).uncheck();
  await box(5).uncheck();
  const save = sidebar.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription("Tick at least one Table");
  await box(5).check();
  await save.click();
  await expect(sidebar.getByRole("button", { name: /^Stacked Table 1\s?Table 5 ·/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();
  await expect(main.getByText("Portland Pearl")).toHaveCount(0);
  await expect(rows.nth(1)).toContainText("Madison Willy St");

  // Add Table 4 back, after Table 5.
  await edit.click();
  await box(4).check();
  await save.click();
  await expect(
    sidebar.getByRole("button", { name: /^Stacked Table 1\s?Tables 5, 4/ }),
  ).toBeVisible();
});

test("Escape and Cancel in Edit Members leave the Members as they were (#53)", async ({ page }) => {
  const { sidebar, main } = await stackedFourFive(page);
  const edit = main.getByRole("button", { name: "Edit Members" });
  await edit.click();
  await sidebar.getByRole("button", { name: "Move Table 5 up" }).click();
  await page.keyboard.press("Escape");
  await expect(sidebar.getByRole("checkbox")).toHaveCount(0);
  const entry = sidebar.getByRole("button", { name: /^Stacked Table 1\s?Tables 4, 5/ });
  await expect(entry).toBeVisible();

  await edit.click();
  await sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ }).uncheck();
  await sidebar.getByRole("button", { name: "Cancel" }).click();
  await expect(entry).toBeVisible();
});

test("Remove Stacked Table removes only it and leaves its Members (#53)", async ({ page }) => {
  const { sidebar, main } = await stackedFourFive(page);
  await main.getByRole("button", { name: "Remove Stacked Table" }).click();
  await expect(status(page)).toHaveText("Removed Stacked Table 1. Its Members are unchanged");
  await expect(sidebar.getByRole("button", { name: /^Stacked Table/ })).toHaveCount(0);
  // Its first Member opens, editable and listed as before.
  await expect(main.getByRole("heading", { name: "Table 4" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: /^Table 4/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(sidebar.getByRole("button", { name: /^Table 5/ })).toBeVisible();
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

// #54: Source Page on a Stacked Table.

/** Stacks Tables 5 and 4, in that order, of the unjoined Example Document. */
async function stackFiveThenFour(page: Page) {
  const ui = await exampleUnjoined(page);
  await ui.sidebar.getByRole("button", { name: /^Select Tables/ }).click();
  await ui.sidebar.getByRole("checkbox", { name: /^Table 5(?!\d)/ }).check();
  await ui.sidebar.getByRole("checkbox", { name: /^Table 4(?!\d)/ }).check();
  await ui.sidebar.getByRole("button", { name: "Stack 2 Tables" }).click();
  await expect(ui.main.getByRole("heading", { name: "Stacked Table 1" })).toBeVisible();
  return ui;
}

test("Source Page on a Stacked Table outlines every Member, page by page", async ({ page }) => {
  const { main } = await stackFiveThenFour(page);
  await main.getByRole("button", { name: "Source Page" }).click();

  // Each Member's page once, in page order, though Table 5 was ticked first.
  const pages = main.getByTestId(/^source-page-/);
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(0)).toHaveAttribute("data-testid", "source-page-2");
  await expect(pages.nth(1)).toHaveAttribute("data-testid", "source-page-3");
  await expect(main.getByText("Page 2", { exact: true })).toBeVisible();

  // Only the Members are outlined, each labelled by its Table number in text.
  const four = main.getByTestId("source-page-2").getByRole("button", { name: "Table 4" });
  const five = main.getByTestId("source-page-3").getByRole("button", { name: "Table 5" });
  await expect(four).toHaveText("Table 4");
  await expect(five).toHaveText("Table 5");
  await expect(pages.getByRole("button")).toHaveCount(2);
  await expect(four).toHaveCSS("border-top-style", "solid");

  // Clicking an outline selects that Member.
  await five.click();
  await expect(main.getByRole("heading", { name: "Table 5" })).toBeVisible();
});

test("pressing Enter on a Member's outline selects it", async ({ page }) => {
  const { main } = await stackFiveThenFour(page);
  await main.getByRole("button", { name: "Source Page" }).click();
  const four = main.getByTestId("source-page-2").getByRole("button", { name: "Table 4" });
  await four.focus();
  await page.keyboard.press("Enter");
  await expect(main.getByRole("heading", { name: "Table 4" })).toBeVisible();
});

test("a left-out Member is outlined on the Source Page but marked as left out", async ({
  page,
}) => {
  const { sidebar, main } = await stackFiveThenFour(page);
  await sidebar.getByRole("button", { name: /^Table 5/ }).click();
  await main.getByRole("switch", { name: "First row is header" }).uncheck();
  await sidebar.getByRole("button", { name: /^Stacked Table 1/ }).click();
  await main.getByRole("button", { name: "Source Page" }).click();

  const five = main.getByTestId("source-page-3").getByRole("button", { name: /^Table 5/ });
  await expect(five).toHaveAccessibleName("Table 5 · left out");
  await expect(five).toHaveText("Table 5 · left out");
  await expect(five).toHaveCSS("border-top-style", "dashed");
  const four = main.getByTestId("source-page-2").getByRole("button", { name: "Table 4" });
  await expect(four).toHaveCSS("border-top-style", "solid");

  await five.click();
  await expect(main.getByRole("heading", { name: "Table 5" })).toBeVisible();
});
