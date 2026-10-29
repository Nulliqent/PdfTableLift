import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

const fixturePath = (name: string) => join(import.meta.dirname, "..", "fixtures", name);

type Dropped = { name: string; type: string; data: number[] };

const pdf = (name: string): Dropped => ({
  name,
  type: "application/pdf",
  data: [...readFileSync(fixturePath(name))],
});

/** Drags files over the window; `drop()` releases them. */
async function dragFiles(page: Page, files: Dropped[]) {
  const dataTransfer = await page.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list)
      dt.items.add(new File([new Uint8Array(f.data)], f.name, { type: f.type }));
    return dt;
  }, files);
  const fire = (type: string) =>
    page.evaluate(
      ([t, dt]) =>
        window.dispatchEvent(
          new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }),
        ),
      [type, dataTransfer] as const,
    );
  await fire("dragenter");
  await fire("dragover");
  return { drop: () => fire("drop") };
}

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Documents" });
const example = (page: Page) => sidebar(page).getByText("Northwind Q3 Summary.pdf");

test("the Example Document greets first-time visitors and steps aside for their own file", async ({
  page,
}) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();
  await expect(example(page)).toBeVisible();
  await expect(sidebar(page).getByText("(example)")).toBeVisible();
  await expect(sidebar(page).getByRole("button", { name: /Table 1/ })).toBeVisible();

  await openFixture(page, "separate-tables.pdf");

  await expect(sidebar(page).getByText("separate-tables.pdf")).toBeVisible();
  await expect(example(page)).toHaveCount(0);
});

test("dragging files shows the overlay, and dropping opens every PDF", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();
  await expect(example(page)).toBeVisible();

  const dragging = await dragFiles(page, [pdf("separate-tables.pdf"), pdf("embedded-bold.pdf")]);
  const overlay = page.getByText("PDF files are read on this device and never uploaded");
  await expect(overlay).toBeVisible();
  await dragging.drop();
  await expect(overlay).toBeHidden();

  await expect(sidebar(page).getByText("separate-tables.pdf")).toBeVisible();
  await expect(sidebar(page).getByText("embedded-bold.pdf")).toBeVisible();
  await expect(example(page)).toHaveCount(0);
});

test("dropping only non-PDFs explains and keeps the Example Document", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();
  await expect(example(page)).toBeVisible();

  const dragging = await dragFiles(page, [{ name: "notes.txt", type: "text/plain", data: [104] }]);
  await dragging.drop();

  await expect(
    page.getByRole("status").filter({ hasText: "Only PDF files can be read" }),
  ).toBeVisible();
  await expect(example(page)).toBeVisible();
});

test("a mixed drop opens the PDFs and reports how many files were skipped", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();

  const dragging = await dragFiles(page, [
    pdf("separate-tables.pdf"),
    { name: "a.txt", type: "text/plain", data: [1] },
    { name: "b.png", type: "image/png", data: [2] },
  ]);
  await dragging.drop();

  await expect(sidebar(page).getByText("separate-tables.pdf")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Skipped 2 files that weren't PDFs" }),
  ).toBeVisible();
});

test("Ctrl+O and the sidebar drop area open the file chooser", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();

  const viaShortcut = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await viaShortcut;

  const dropArea = sidebar(page).getByRole("button", { name: "Choose PDF files" });
  const viaClick = page.waitForEvent("filechooser");
  await dropArea.click();
  await viaClick;

  for (const key of ["Enter", "Space"]) {
    const viaKey = page.waitForEvent("filechooser");
    await dropArea.focus();
    await page.keyboard.press(key);
    await viaKey;
  }
});

test("removing a Document says Removed and selects the next Document with Tables", async ({
  page,
}) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await (
    await chooser
  ).setFiles([fixturePath("separate-tables.pdf"), fixturePath("embedded-bold.pdf")]);
  await expect(sidebar(page).getByText("embedded-bold.pdf")).toBeVisible();
  // Both are read in parallel, so which one is selected first varies. Select the first one.
  await expect(sidebar(page).getByRole("button", { name: /Table 1/ })).toHaveCount(2);
  await sidebar(page)
    .getByRole("button", { name: /Table 1/ })
    .first()
    .click();
  await expect(page.getByRole("main")).toContainText("separate-tables.pdf");

  await sidebar(page).getByRole("button", { name: "Remove separate-tables.pdf" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Removed separate-tables.pdf" }),
  ).toBeVisible();
  await expect(sidebar(page).getByText("separate-tables.pdf")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("embedded-bold.pdf");
});

async function expectSourcePageDrawn(page: Page) {
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Source Page" }).click();
  await expect(main.getByTestId("source-page-1").locator("canvas")).toBeVisible();
  await expect(main.getByText("This page couldn't be drawn.")).toHaveCount(0);
}

test("the Source Page draws for the Example Document", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();
  await expect(page.getByRole("main").getByRole("heading", { name: /Table/ })).toBeVisible();

  await expectSourcePageDrawn(page);
});

test("the Source Page draws for a dropped file", async ({ page }) => {
  await page.goto("/");
  await expect(example(page)).toBeVisible();

  const dragging = await dragFiles(page, [pdf("separate-tables.pdf")]);
  await dragging.drop();
  await expect(page.getByRole("main")).toContainText("separate-tables.pdf");

  await expectSourcePageDrawn(page);
});
