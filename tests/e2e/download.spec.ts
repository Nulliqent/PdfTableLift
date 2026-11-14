import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { openFixture } from "./support/open-fixture";

test("Download saves the Table in the chosen format, on the device, by keyboard", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const offOrigin: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && url.origin !== origin)
      offOrigin.push(request.url());
  });
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.goto("/");
  await openFixture(page, "separate-tables.pdf");
  const main = page.getByRole("main");
  await page
    .getByRole("complementary", { name: "Documents" })
    .getByRole("button", { name: /Table 2/ })
    .click();
  await main.getByRole("button", { name: "Spreadsheet (TSV)" }).click();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Download" }).focus();
  await page.keyboard.press("Enter");
  const file = await download;

  expect(file.suggestedFilename()).toBe("separate-tables.pdf - Table 2.tsv");
  expect(await readFile((await file.path())!, "utf8")).toBe(
    "\uFEFFTeam\tStaff\tOpen roles\nEngineering\t42\t6\nSupport\t18\t2\nSales\t25\t4",
  );
  await expect(page.getByRole("status").filter({ hasText: "Downloaded" })).toBeVisible();
  expect(offOrigin).toEqual([]);
  expect(
    await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  ).toEqual([]);
});

test("Download is offered on a Joined Table", async ({ page }) => {
  await page.goto("/");
  await openFixture(page, "section-page-break.pdf");
  const main = page.getByRole("main");
  await expect(main.getByText(/Joined from 2 pages/)).toBeVisible();

  const download = page.waitForEvent("download");
  await main.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("section-page-break.pdf - Table 1.csv");
});

test.describe("a Hand-drawn Table", () => {
  // A tall window, so the whole page is on screen and can be dragged over with the mouse.
  test.use({ viewport: { width: 1280, height: 1600 } });

  test("offers Download", async ({ page }) => {
    await page.goto("/");
    await openFixture(page, "separate-tables.pdf");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: /^Table 1/ })).toBeVisible();
    await page.getByRole("button", { name: /Select Table Region/ }).click();
    const layer = main.getByLabel("Drag to select a table region");
    const b = (await layer.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.05, b.y + b.height * 0.07);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.2);
    await page.mouse.move(b.x + b.width * 0.95, b.y + b.height * 0.35);
    await page.mouse.up();
    await main.getByRole("button", { name: "Add Table" }).click();
    await expect(main.getByText("Selected by hand")).toBeVisible();

    const download = page.waitForEvent("download");
    await main.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("separate-tables.pdf - Table 1.csv");
  });
});
