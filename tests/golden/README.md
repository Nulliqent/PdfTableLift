# Golden snapshots

`snapshots/` records exactly what the prototype (the design artifact, `harness/prototype.html`) produces for every fixture PDF, running its own engine on **pdf.js 3.11.174**, the version it loads from its CDN. The port and the pdf.js upgrade are checked against these files, so a detection change can't slip through unnoticed. Any change to a snapshot needs a justification in the commit message.

## Re-running

```sh
npm run fixtures   # writes tests/fixtures/*.pdf and public/example-document.pdf
npm run golden     # installs the harness's pdf.js 3.11.174, then writes snapshots/*.json
```

Both commands are deterministic. On an unchanged checkout they leave `git status` clean. `tests/unit/fixtures.test.ts` checks that the fixture script reproduces the committed PDFs byte for byte, and that each snapshot's `sha256` matches its fixture. If you change a fixture, run both commands and commit the PDFs and snapshots together.

Optional fidelity check: `node tests/golden/harness/browser-check.mjs` opens the real `prototype.html` in Playwright Chromium, which needs a network connection because it loads pdf.js from cdnjs. It loads each fixture through the page's own `addFile` and compares the result with the snapshot. On 2026-10-28 all 15 snapshots matched exactly: text items, Tables and every export.

## How the harness works

`harness/` is a separate npm package (its own `package.json` and lockfile) that pins `pdfjs-dist` at exactly `3.11.174`. The app's own `pdfjs-dist` in the root `package.json` is a different, current version and is never affected. `npm run golden` runs `npm ci --omit=optional` in that folder; the optional `canvas` dependency isn't needed for text extraction.

`harness/golden.mjs`:

1. Reads `prototype.html` as text and slices out its engine between the `/* ---------- Table detection ---------- */` and `function toggleSection` markers. That region covers detection, joining, `addFile`, `detectFile` and export.
2. Runs that code in a `node:vm` context, with the prototype's `state` and no-op `render()`/`hud()`.
3. For each fixture, calls the prototype's own `addFile`. Item extraction (rotated/empty items, bold from `commonObjs`, the US-14 row split) and error messages are the prototype's code, not a re-port.
4. For each setting in the matrix, sets `state.gap` (Column Spacing) and `state.join`, then calls `detectFile`. That is the same re-detection the slider and the join switch trigger. It records every Table and calls `exportText` for each format in each Section Mode.

## Snapshot format

There is one JSON file per fixture: `snapshots/<fixture name>.json` (`example-document.json` for `public/example-document.pdf`). Values of 120 characters or fewer sit on one line, so diffs read line by line. It's plain JSON; read it with `JSON.parse`.

```jsonc
{
  "fixture": "tests/fixtures/section-headers.pdf", // path from the repo root
  "sha256": "…",                // of the fixture bytes the snapshot was taken from
  "pdfjs": "3.11.174",
  "status": "ready",            // or "error"
  "error": "",                  // the prototype's message when status is "error"
  "pages": [                    // the prototype's PageText, in the spec's TextItem shape
    { "num": 1, "w": 612, "h": 792,
      "items": [{ "str": "Store", "x": 72, "y": 710, "w": 23.0, "h": 9, "bold": true }] }
  ],
  "runs": [                     // one entry per setting
    { "columnSpacing": 1, "joining": true,
      "tables": [
        { "n": 1,               // 1-based position in the Document's Table list
          "pages": [1],         // page range: one entry per Part
          "parts": [{ "page": 1, "bbox": [x0, y0, x1, y1] }],  // PDF coordinates
          "header": true,       // "First row is header" (always on after detection)
          "firstBold": true,    // the Header Row is bold
          "grid": [["Store", "Manager", "Q1", "Q2"], ["West", "", "", ""], …],
          "sections": [1, 4, 7],  // grid row indexes of Section Headers
          "cols": [[x0, x1], …],  // column bands
          "repeats": 0,           // repeated Header Rows dropped by joining
          "exports": {
            "column": { "csv": "…", "tsv": "…", "md": "…", "json": "…" },  // Section Mode As Column
            "rows":   { "csv": "…", "tsv": "…", "md": "…", "json": "…" }   // Section Mode As Rows
          } } ] }
  ]
}
```

- **Settings matrix.** `runs` holds Column Spacing 1.0 (the default), 0.5 and 2.0, each with joining on and off, in that order: `[1,on] [1,off] [0.5,on] [0.5,off] [2,on] [2,off]`.
- **`perf-200-pages` is the exception.** It runs only at Column Spacing 1.0 (joining on and off), and its Tables carry `exportDigests` instead of `exports`: the same shape, but each value is the lowercase hex SHA-256 of the UTF-8 export text. The full texts would be several MB.
- **Errors.** Error fixtures have `status: "error"`, the prototype's `error` message, and empty `tables` in every run. `image-only` still lists its page, with no items.
- **Comparing.** For each run, apply the same Column Spacing and joining, then deep-compare the Tables field by field. Compare `pages[].items` against the PDF Reader's output. Floats are pdf.js's raw values; the prototype doesn't round them.

## Fixtures

They are generated by `scripts/fixtures/make-fixtures.mjs` (pdfkit) and written to `tests/fixtures/`.

| Fixture | What it exercises |
| --- | --- |
| `example-document.pdf` (in `public/`) | The Example Document, byte for byte from the prototype's `SAMPLE_B64` |
| `separate-tables` | Two tables on one page, separated by body text (US-16 in the spec) |
| `wrapped-cells` | Wrapped cells, including in right-aligned columns. Ref F-103 wraps two columns on the same line, which the prototype turns into an extra row; that is recorded as-is |
| `section-headers` | Section Headers in a table |
| `section-page-break` | A section that crosses a page break (no repeated header) |
| `repeated-header` | A table over 3 pages with its Header Row repeated on each page |
| `unrelated-tables` | Consecutive pages with different tables, each with its own bold header: not joined |
| `prose-between-pages` | Body text after the first table and before the second: not joined |
| `embedded-bold` | The Header Row in an **embedded** bold font (Lato Bold subset, OFL, `scripts/fixtures/fonts/`) |
| `single-string-rows` | US-14: each row is one text item with runs of spaces. Hand-built (`scripts/fixtures/single-string-rows.mjs`), because pdf.js splits pdfkit's spaces itself |
| `spaced-strings-pdfkit` | Rows written by pdfkit as one string with spaces. pdf.js splits these into items itself, so the PDF Reader's split never runs |
| `encrypted` | Password-protected (RC4 40-bit, password `secret`) |
| `image-only` | An image and no text layer |
| `not-a-pdf` | A text file named `.pdf` |
| `perf-200-pages` | 200 pages, one table continuing over every page with a repeated header (the re-detection benchmark) |
| `statement` | Spec #22: a card statement whose Rows run over several lines, with the dates and amount beside the first, a middle or the last Description line, smaller grey secondary lines and a mid-word break. Invented data only. **No prototype snapshot** (see below) |

### Fixtures not snapshotted from the prototype

The prototype gets `statement` wrong: it splits every Row into its lines, which is the bug spec #22 fixes. A snapshot of that output would pin the bug, so `golden.mjs` leaves this fixture out of its default run (`NOT_FROM_PROTOTYPE`) and never writes or overwrites its snapshot. Its snapshot is recorded from the app's engine by #24, in the same format, and is not from the prototype. Until then `tests/unit/fixtures.test.ts` lists it in `awaitingSnapshot`; every other fixture must still have a snapshot. Its expected Rows are in `tests/unit/multiline-rows.test.ts`.

The repository is public. The statement's merchants, dates and amounts are invented; never copy anything from a real statement or from `screenshot/` into a fixture.
