// Seam C: a Header Region and Body Regions in Select Region (spec #39), in WebKit and Chromium.
//
// These are the acceptance tests for #42 to #45, written before the feature exists, against
// tests/fixtures/parts-list-drawing.pdf (invented data; see scripts/fixtures/make-fixtures.mjs).
// Page 1 has a framed band of two-line column titles above the Rows, a note cutting through the
// list and a title block below. Each test is skipped and named after the ticket that turns it on
// (`#42:` to `#45:`): that ticket replaces `test.skip` with `test` and makes it pass without
// changing what it expects.
//
// The names in the panel list ("Region 1 · Body"), "Add Region" and the Header/Body toggle follow
// the spec. The exact accessible names of the toggle, the remove button and the save message are
// provisional: the ticket that builds them may adjust the locators here, not the expectations.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

// A tall window, so the whole page is on screen and can be dragged over with the mouse.
test.use({ viewport: { width: 1280, height: 1600 } });

/** A box in PDF points, [x0, y0, x1, y1] with y up, on the 612 x 792 page. */
type Box = [number, number, number, number];
const TITLES: Box = [60, 682, 400, 716];
const ROWS_ABOVE_NOTE: Box = [60, 606, 400, 648];
const ROWS_BELOW_NOTE: Box = [60, 522, 400, 560];
const BLANK: Box = [60, 440, 400, 470];

async function drag(page: Page, layer: Locator, [x0, y0, x1, y1]: Box) {
  const b = (await layer.boundingBox())!;
  const at = (x: number, y: number) => [
    b.x + (b.width * x) / 612,
    b.y + (b.height * (792 - y)) / 792,
  ];
  const [ax, ay] = at(x0, y1)!;
  const [bx, by] = at(x1, y0)!;
  await page.mouse.move(ax!, ay!);
  await page.mouse.down();
  await page.mouse.move((ax! + bx!) / 2, (ay! + by!) / 2);
  await page.mouse.move(bx!, by!);
  await page.mouse.up();
}

async function enterSelectRegion(page: Page) {
  await page.goto("/");
  await openFixture(page, "parts-list-drawing.pdf");
  const main = page.getByRole("main");
  await page
    .getByRole("button", { name: /Select Table Region/ })
    .first()
    .click();
  const layer = main.getByLabel("Drag to select a table region");
  await expect(layer).toBeVisible();
  return { main, layer };
}

/** The panel list entry of Region `n` ("Region 2 · Header"). */
const entry = (main: Locator, n: number) =>
  main.getByRole("listitem").filter({ hasText: `Region ${n}` });
const setRole = (main: Locator, n: number, role: "Header" | "Body") =>
  entry(main, n).getByRole("button", { name: role, exact: true }).click();

/** Titles as a Header Region, the Rows above the note as a Body Region. */
async function drawTitlesAndRows(page: Page, main: Locator, layer: Locator) {
  await drag(page, layer, ROWS_ABOVE_NOTE);
  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, TITLES);
  await setRole(main, 2, "Header");
}

test("#42: Add Region, Header toggle, preview and one Save make one Table with the titles in place", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drag(page, layer, ROWS_ABOVE_NOTE);
  await expect(entry(main, 1)).toContainText("Region 1 · Body");

  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, TITLES);
  await setRole(main, 2, "Header");
  await expect(entry(main, 2)).toContainText("Region 2 · Header");
  await expect(page.getByRole("status").filter({ hasText: /Region 2 .*Header/ })).toBeVisible();

  // The live preview is the combined Table: two-line titles joined into one Cell.
  await expect(main.getByRole("columnheader", { name: "PART NUMBER" })).toBeVisible();
  await expect(main.getByRole("columnheader", { name: "MATERIAL SPEC" })).toBeVisible();
  await expect(main.getByRole("cell", { name: "BK-1003" })).toBeVisible();

  await main.getByRole("button", { name: "Add Table" }).click();
  await expect(main.getByText("Selected by hand")).toBeVisible();
  await expect(main.getByRole("columnheader", { name: "PART NUMBER" })).toBeVisible();
  await expect(main.getByRole("switch", { name: "First row is header" })).toHaveCount(0);
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  await expect(sidebar.getByRole("button", { name: /Selected by hand/ })).toHaveCount(1);
});

test("#42: marking a second Region Header turns the first back to Body, and removing a Region is announced", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);

  await setRole(main, 1, "Header");
  await expect(entry(main, 1)).toContainText("Region 1 · Header");
  await expect(entry(main, 2)).toContainText("Region 2 · Body");

  await entry(main, 2)
    .getByRole("button", { name: /Remove/ })
    .click();
  await expect(main.getByRole("listitem").filter({ hasText: /^Region / })).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: /Region 2 removed/ })).toBeVisible();
});

test("#42: Save is disabled with a short reason while the Header Region or every Body Region has no text", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drag(page, layer, ROWS_ABOVE_NOTE);
  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, BLANK);
  await setRole(main, 2, "Header");

  await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();
  await expect(main.getByText("No text in the Header Region")).toBeVisible();

  // A Header Region with text, alone, has no Rows.
  await drag(page, layer, TITLES);
  await entry(main, 1)
    .getByRole("button", { name: /Remove/ })
    .click();
  await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();
  await expect(main.getByText("No Body Region with text")).toBeVisible();
});

test("#42: the panel list works by keyboard alone, and Escape discards every Region", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await setRole(main, 2, "Body");

  const toggle = entry(main, 2).getByRole("button", { name: "Header", exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(entry(main, 2)).toContainText("Region 2 · Header");
  await page.keyboard.press("Escape");

  await expect(main.getByText("Selected by hand")).toHaveCount(0);
  await expect(main.getByRole("heading", { name: /^Table 1/ })).toBeVisible();
});

test("#42: the source page outlines every Region of the selected Table, the Header Region with a tag and a different style", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Table" }).click();
  await main.getByRole("button", { name: "Source Page" }).click();

  const outlines = main.getByTestId("region-outline");
  await expect(outlines).toHaveCount(2);
  await expect(main.getByTestId("region-outline").getByText("Header", { exact: true })).toHaveCount(
    1,
  );
  const styles = await outlines.evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).borderStyle),
  );
  expect(new Set(styles).size).toBe(2); // dashed for the Header Region, so colour is not the only cue
});

test("#42: the Header Row keeps its H menu, and Copy includes the titles", async ({ page }) => {
  await page.addInitScript(() => {
    const written: string[] = [];
    Object.assign(window, { clipboardWrites: written });
    navigator.clipboard.writeText = (text: string) => {
      written.push(text);
      return Promise.resolve();
    };
  });
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Table" }).click();

  await expect(main.getByRole("button", { name: "Header Row. Row actions" })).toBeVisible();
  await main.getByRole("button", { name: "Copy" }).click();
  const copied = await page.evaluate(() =>
    (window as unknown as { clipboardWrites: string[] }).clipboardWrites.at(-1),
  );
  expect(copied).toMatch(/^ITEM,PART NUMBER,DESCRIPTION,QTY,MATERIAL SPEC\n1,BK-1001,/);
});

test("#43: two Body Regions on either side of the note leave the note out", async ({ page }) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, ROWS_BELOW_NOTE);
  await expect(entry(main, 3)).toContainText("Region 3 · Body");

  await expect(main.getByRole("cell", { name: "FS-2012" })).toBeVisible();
  await expect(main.getByText(/DEBURR/)).toHaveCount(0);
  await main.getByRole("button", { name: "Add Table" }).click();
  await expect(main.getByRole("cell", { name: "BK-1001" })).toBeVisible();
  await expect(main.getByRole("cell", { name: "FS-2010" })).toBeVisible();
  await expect(main.getByText(/DEBURR/)).toHaveCount(0);
});

test("#44: the Single-Row switch is on each Body Region and not on the Header Region", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);

  const oneRow = (n: number) =>
    entry(main, n).getByRole("switch", { name: "Treat Region as one row" });
  await expect(oneRow(1)).toBeVisible();
  await expect(oneRow(2)).toHaveCount(0);

  await oneRow(1).focus();
  await page.keyboard.press("Space");
  await expect(oneRow(1)).toBeChecked();
  await expect(page.getByRole("status").filter({ hasText: /one row/ })).toBeVisible();

  // Header and back to Body: the switch returns as it was.
  await setRole(main, 1, "Header");
  await setRole(main, 2, "Body");
  await setRole(main, 1, "Body");
  await expect(oneRow(1)).toBeChecked();
});

test("#45: redrawing a multi-Region Table reopens every Region, and saving updates the same Table", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Table" }).click();
  await expect(main.getByText("Selected by hand")).toBeVisible();

  await main.getByRole("button", { name: "Redraw Region" }).click();
  await expect(entry(main, 1)).toContainText("Region 1 · Body");
  await expect(entry(main, 2)).toContainText("Region 2 · Header");

  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, ROWS_BELOW_NOTE);
  await main.getByRole("button", { name: "Replace Table" }).click();
  await expect(main.getByRole("heading", { name: /^Table 1/ })).toBeVisible();
  await expect(main.getByText("Selected by hand")).toBeVisible();
  await expect(main.getByRole("cell", { name: "FS-2010" })).toBeVisible();
});

test("#45: deleting a Hand-drawn Table with several Regions removes them all", async ({ page }) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Table" }).click();
  await main.getByRole("button", { name: "Source Page" }).click();
  await expect(main.getByTestId("region-outline")).toHaveCount(2);

  await main.getByRole("button", { name: "Remove Table" }).click();
  await expect(main.getByTestId("region-outline")).toHaveCount(0);
  await expect(main.getByText("Selected by hand")).toHaveCount(0);
});

test("a Region added but never drawn disables Save with the reason, until it is drawn or removed", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drag(page, layer, ROWS_ABOVE_NOTE);
  await main.getByRole("button", { name: "Add Region" }).click();

  await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();
  await expect(main.getByText("Region 2 is not drawn yet")).toBeVisible();

  await drag(page, layer, ROWS_BELOW_NOTE);
  await expect(main.getByRole("button", { name: "Add Table" })).toBeEnabled();
});

test("Combine and Split back work on a Table with a Header Region, the Header Row menu included", async ({
  page,
}) => {
  const { main, layer } = await enterSelectRegion(page);
  await drawTitlesAndRows(page, main, layer);
  await main.getByRole("button", { name: "Add Table" }).click();
  await expect(main.getByRole("columnheader", { name: "PART NUMBER" })).toBeVisible();

  // The Header Row's menu has Combine with Row below, and no Row above.
  await main.getByRole("button", { name: "Header Row. Row actions" }).click();
  const menu = page.getByRole("menu", { name: "Header Row" });
  await expect(menu.getByRole("menuitem", { name: "Combine with Row above" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Combine with Row below" }).click();
  await expect(page.getByRole("status")).toHaveText("Rows combined");
  await expect(main.getByRole("columnheader", { name: "ITEM 1" })).toBeVisible();

  await main.getByRole("button", { name: "Header Row. Row actions" }).click();
  await page
    .getByRole("menu", { name: "Header Row" })
    .getByRole("menuitem", { name: "Split back" })
    .click();
  await expect(main.getByRole("columnheader", { name: "ITEM", exact: true })).toBeVisible();
  await expect(main.getByRole("cell", { name: "BK-1001" })).toBeVisible();

  // A Body Row combined with the Row above, then split back.
  await main.getByRole("button", { name: /^Row 2\./ }).click();
  await page
    .getByRole("menu", { name: "Row 2" })
    .getByRole("menuitem", { name: "Combine with Row above" })
    .click();
  await expect(main.getByRole("cell", { name: "BK-1001 BK-1002" })).toBeVisible();
  await main.getByRole("button", { name: /^Row 1\./ }).click();
  await page
    .getByRole("menu", { name: "Row 1" })
    .getByRole("menuitem", { name: "Split back" })
    .click();
  await expect(main.getByRole("cell", { name: "BK-1002", exact: true })).toBeVisible();
});

// section-headers.pdf: Store/Manager/Q1/Q2 at y 710, then West (a Section Header), two stores,
// Central, two stores, East, two stores.
test("a Section Header opening the Body Region keeps its place under a Header Region, As Rows and As Column", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "section-headers.pdf");
  const main = page.getByRole("main");
  await page
    .getByRole("button", { name: /Select Table Region/ })
    .first()
    .click();
  const layer = main.getByLabel("Drag to select a table region");
  await drag(page, layer, [60, 580, 520, 702]);
  await main.getByRole("button", { name: "Add Region" }).click();
  await drag(page, layer, [60, 705, 520, 722]);
  await setRole(main, 2, "Header");
  await main.getByRole("button", { name: "Add Table" }).click();

  await main.getByRole("button", { name: "As Rows" }).click();
  await expect(main.getByRole("columnheader", { name: "Store" })).toBeVisible();
  // West sits right under the Header Row as a Section Header, and so do Central and East.
  const sections = main.getByRole("button", { name: /^Row is a Section Header\. Row actions/ });
  await expect(sections).toHaveCount(3);
  await expect(main.getByRole("cell", { name: "West", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: /^Row 1\. Row actions/ })).toBeVisible();

  await main.getByRole("button", { name: "As Column" }).click();
  await expect(main.getByRole("columnheader", { name: "Section" })).toBeVisible();
  await expect(main.getByRole("cell", { name: "West", exact: true }).first()).toBeVisible();
  await expect(main.getByRole("cell", { name: "Portland" })).toBeVisible();
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("add a Region, toggle its role, remove it and save", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "parts-list-drawing.pdf");
    const main = page.getByRole("main");
    await page
      .getByRole("button", { name: /Select Table Region/ })
      .first()
      .click();
    await main.getByRole("button", { name: "Select Whole Page" }).tap();
    await main.getByRole("button", { name: "Add Region" }).tap();
    await expect(main.getByText("Region 2 is not drawn yet")).toBeVisible();
    await main.getByRole("button", { name: "Select Whole Page" }).tap();

    // Every control of the list fits inside the phone's width.
    for (const control of [
      entry(main, 2).getByRole("button", { name: "Header", exact: true }),
      entry(main, 2).getByRole("button", { name: "Body", exact: true }),
      entry(main, 2).getByRole("button", { name: /Remove/ }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page scroll").toBeLessThanOrEqual(0);

    await entry(main, 2).getByRole("button", { name: "Header", exact: true }).tap();
    await expect(entry(main, 2)).toContainText("Region 2 · Header");
    await expect(main.getByRole("button", { name: "Add Table" })).toBeDisabled();
    await entry(main, 2).getByRole("button", { name: "Body", exact: true }).tap();
    await entry(main, 2)
      .getByRole("button", { name: /Remove/ })
      .tap();
    await expect(page.getByRole("status").filter({ hasText: /Region 2 removed/ })).toBeVisible();

    await main.getByRole("button", { name: "Add Table" }).tap();
    await expect(main.getByText("Selected by hand")).toBeVisible();
  });
});
