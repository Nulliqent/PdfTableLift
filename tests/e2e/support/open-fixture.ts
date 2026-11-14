import { join } from "node:path";
import type { Page } from "@playwright/test";

const fixtureDir = join(import.meta.dirname, "..", "..", "fixtures");

/** Opens a fixture PDF through the toolbar's Open PDF button and the file chooser. */
export async function openFixture(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("banner").getByRole("button", { name: "Open PDF" }).click();
  await (await chooser).setFiles(join(fixtureDir, name));
}
