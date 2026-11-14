import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

const SCANNED = "No text found. This looks like a scanned PDF, which needs OCR first.";
const PASSWORD = "This PDF is password-protected. Remove the password and try again.";
const NOT_PDF = "This file couldn't be read as a PDF.";

test("each unreadable PDF explains itself on its sidebar entry and leaves the others alone", async ({
  page,
}) => {
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  const main = page.getByRole("main");

  await openFixture(page, "separate-tables.pdf");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
  await openFixture(page, "image-only.pdf");
  await openFixture(page, "encrypted.pdf");
  await openFixture(page, "not-a-pdf.pdf");

  await expect(sidebar.getByText(SCANNED)).toBeVisible();
  await expect(sidebar.getByText(PASSWORD)).toBeVisible();
  await expect(sidebar.getByText(NOT_PDF)).toBeVisible();
  await expect(sidebar.getByText("Reading pages…")).toHaveCount(0);
  // The readable Document keeps its Tables and its selection.
  await expect(sidebar.getByRole("button", { name: /^Table 2/ })).toBeVisible();
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();

  // Removing a failed Document drops only that entry.
  await sidebar.getByRole("button", { name: "Remove not-a-pdf.pdf" }).click();
  await expect(sidebar.getByText(NOT_PDF)).toHaveCount(0);
  await expect(sidebar.getByText(SCANNED)).toBeVisible();
});

test("the read error is announced for a Document still open, not for one removed while loading", async ({
  page,
}) => {
  // Holds back not-a-pdf.pdf's bytes until the test releases them, and records every HUD message.
  await page.addInitScript(() => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function (this: File) {
      if (this.name === "not-a-pdf.pdf") await held;
      return read.call(this);
    };
    const said: string[] = [];
    Object.assign(window, { releaseHeld: release, hudSaid: said });
    new MutationObserver(() => {
      const text = document.querySelector('[role="status"][aria-live="polite"]')?.textContent;
      if (text && said.at(-1) !== text) said.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await page.goto("/");
  const sidebar = page.getByRole("complementary", { name: "Documents" });
  const main = page.getByRole("main");
  const said = () => page.evaluate(() => (window as unknown as { hudSaid: string[] }).hudSaid);
  await openFixture(page, "separate-tables.pdf");
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();

  await openFixture(page, "not-a-pdf.pdf");
  await expect(sidebar.getByText("Reading pages…")).toBeVisible();
  await sidebar.getByRole("button", { name: "Remove not-a-pdf.pdf" }).click();
  await expect(page.getByRole("status").getByText("Removed not-a-pdf.pdf")).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseHeld: () => void }).releaseHeld());
  // Give the released read time to fail, then check nothing announced its error.
  await page.waitForTimeout(1000);
  expect(await said()).not.toContain(NOT_PDF);

  // The same failure on a Document that stays open is announced, the pane keeping its Table.
  await openFixture(page, "not-a-pdf.pdf");
  await expect(page.getByRole("status").getByText(NOT_PDF)).toBeVisible();
  await expect(main.getByRole("heading", { name: "Table 1" })).toBeVisible();
});

test("the content pane shows the error when it is the only Document", async ({ page }) => {
  await page.goto("/");
  await openFixture(page, "image-only.pdf");

  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "image-only.pdf" })).toBeVisible();
  await expect(main.getByText(SCANNED)).toBeVisible();
  await expect(main.getByText("Reading your PDF…")).toHaveCount(0);
});

test("a Document with text but no Tables offers Select Region and points to Column Spacing", async ({
  page,
}) => {
  await page.goto("/");
  await openFixture(page, "embedded-bold.pdf");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Remove Table" }).click();

  await expect(main.getByRole("heading", { name: "No tables were detected" })).toBeVisible();
  await expect(main.getByText(/Column Spacing/)).toBeVisible();
  await main.getByRole("button", { name: "Select Table Region" }).click();
  await expect(main.getByRole("button", { name: "Select Whole Page" })).toBeVisible();
});

test("a PDF Reader that fails to load turns the Document into an error instead of hanging", async ({
  page,
}) => {
  await page.route(/assets\/pdf-reader-.*\.js/, (route) => route.abort());
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");

  const main = page.getByRole("main");
  await expect(main.getByText(NOT_PDF)).toBeVisible();
  await expect(page.getByText("Reading pages…")).toHaveCount(0);
});
