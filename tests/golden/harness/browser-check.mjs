// Optional fidelity check: opens the real prototype.html in Playwright Chromium (pdf.js 3.11 from
// its CDN, so it needs a network connection), loads each fixture through the page's own addFile,
// and compares the result with the committed snapshot. It proves that the Node harness records
// what the prototype does in a browser.
//
// Usage (from the repo root, after `npm install`): node tests/golden/harness/browser-check.mjs
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const snapDir = join(here, "..", "snapshots");

// Runs inside the prototype page. `state`, `addFile`, `detectFile` and `exportText` are its globals.
async function runInPrototype({ bytes, runs }) {
  /* global state, addFile, detectFile, exportText */
  state.files.length = 0;
  state.sel = null;
  state.gap = 1;
  state.join = true;
  const data = new Uint8Array(bytes);
  await addFile("fixture.pdf", data, data.length);
  const f = state.files[0];
  const out = {
    status: f.status,
    error: f.error,
    pages: f.pages.map((p) => ({
      num: p.num,
      w: p.w,
      h: p.h,
      items: p.items.map((it) => ({ str: it.str, x: it.x, y: it.y, w: it.w, h: it.h, bold: it.b })),
    })),
    runs: [],
  };
  for (const r of runs) {
    state.gap = r.columnSpacing;
    state.join = r.joining;
    if (f.status === "ready") detectFile(f);
    const tables =
      f.status !== "ready"
        ? []
        : f.tables.map((t) => {
            const exports = {};
            for (const m of ["column", "rows"]) {
              state.sectionMode = m;
              exports[m] = {};
              for (const fmt of ["csv", "tsv", "md", "json"]) exports[m][fmt] = exportText(t, fmt);
            }
            state.sectionMode = "column";
            return {
              n: t.n,
              pages: t.parts.map((x) => x.page),
              parts: t.parts.map((x) => ({ page: x.page, bbox: x.bbox })),
              header: t.header,
              firstBold: t.firstBold,
              grid: t.grid,
              sections: t.sections,
              cols: t.cols,
              repeats: t.repeats ?? 0,
              exports,
            };
          });
    out.runs.push({ columnSpacing: r.columnSpacing, joining: r.joining, tables });
  }
  return out;
}

// Everything the snapshot records; for digest-only snapshots the export texts are left out.
const comparable = (s, withExports) => ({
  status: s.status,
  error: s.error,
  pages: s.pages,
  runs: s.runs.map((r) => ({
    ...r,
    tables: r.tables.map((t) => {
      const rest = { ...t };
      delete rest.exports;
      delete rest.exportDigests;
      return withExports ? { ...rest, exports: t.exports } : rest;
    }),
  })),
});

const browser = await chromium.launch();
let failed = 0;
for (const file of readdirSync(snapDir)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const snap = JSON.parse(readFileSync(join(snapDir, file), "utf8"));
  const page = await browser.newPage();
  await page.goto("file://" + join(here, "prototype.html"));
  // Wait for the prototype to finish loading its own Example Document first.
  await page.waitForFunction(
    () => typeof state !== "undefined" && state.files[0]?.status === "ready",
  );
  const got = await page.evaluate(runInPrototype, {
    bytes: [...readFileSync(join(root, snap.fixture))],
    runs: snap.runs.map((r) => ({ columnSpacing: r.columnSpacing, joining: r.joining })),
  });
  await page.close();
  const withExports = !snap.runs.some((r) => r.tables.some((t) => t.exportDigests));
  const same =
    JSON.stringify(comparable(got, withExports)) === JSON.stringify(comparable(snap, withExports));
  if (!same) failed++;
  console.log(`${same ? "same" : "DIFFERENT"}  ${file}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
