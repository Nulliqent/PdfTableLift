// Writes every test PDF. Run with `npm run fixtures`.
//
// Output is deterministic: the same script and pdfkit version write byte-identical files, so a
// regenerated fixture shows up in `git diff` only when the script changed. What keeps it stable:
// a fixed CreationDate (pdfkit derives the trailer /ID from it), RC4 encryption (AES draws random
// IVs), and a seeded random generator for table values.
//
// Fixtures go to tests/fixtures/. The Example Document is copied byte-for-byte out of the
// prototype (tests/golden/harness/prototype.html) into public/example-document.pdf.
//
// Usage: node make-fixtures.mjs [fixtureDir] [exampleDir]   (defaults: tests/fixtures, public)
import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { buildSingleStringRowsPdf } from "./single-string-rows.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const outDir = process.argv[2] ?? join(root, "tests", "fixtures");
const exampleDir = process.argv[3] ?? join(root, "public");
mkdirSync(outDir, { recursive: true });

const CREATED = new Date(Date.UTC(2026, 0, 1));
const H = 792; // Letter height in pt
const SIZE = 9; // body font size
const PITCH = 14; // distance between table rows
const BOLD_TTF = join(here, "fonts", "Lato-Bold.ttf");

function write(name, opts, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 0,
      info: { CreationDate: CREATED, Title: name },
      ...opts,
    });
    doc.registerFont("EmbeddedBold", BOLD_TTF);
    const s = createWriteStream(join(outDir, `${name}.pdf`));
    doc.pipe(s);
    s.on("finish", resolve);
    s.on("error", reject);
    draw(doc);
    doc.end();
  });
}

// Draw one text run with its baseline at PDF coordinate (x, y); pdf.js reports exactly x and y.
// align "right" puts the run's right edge at x.
function at(doc, str, x, y, { bold = false, font, size = SIZE, align = "left" } = {}) {
  doc.font(font ?? (bold ? "Helvetica-Bold" : "Helvetica")).fontSize(size);
  const left = align === "right" ? x - doc.widthOfString(str) : x;
  doc.text(str, left, H - y, { lineBreak: false, baseline: "alphabetic" });
}

// A paragraph of body text: one line per string, at the usual line spacing for 10pt text.
function prose(doc, lines, x, y) {
  lines.forEach((l, i) => at(doc, l, x, y - i * 13, { size: 10 }));
  return y - lines.length * 13;
}

/**
 * Draw a table. cols: [{ x, align? }] (x is the right edge for align "right").
 * rows: arrays of cell strings, or { cells, bold?, font?, section? }.
 *   A cell may be an array of strings: its extra lines are drawn as a wrapped cell (11pt below).
 *   section: a lone Section Header label drawn in bold in the first column.
 * Returns the y of the next free row.
 */
function table(doc, cols, rows, y) {
  for (const r of rows) {
    const row = Array.isArray(r) ? { cells: r } : r;
    if (row.section) {
      at(doc, row.section, cols[0].x, y, { bold: true });
      y -= PITCH;
      continue;
    }
    let lines = 1;
    row.cells.forEach((cell, i) => {
      const parts = Array.isArray(cell) ? cell : [cell];
      parts.forEach((p, k) => {
        if (p)
          at(doc, p, cols[i].x, y - k * 11, {
            bold: row.bold,
            font: row.font,
            align: cols[i].align,
          });
      });
      lines = Math.max(lines, parts.length);
    });
    y -= PITCH + (lines - 1) * 11;
  }
  return y;
}

// Seeded random numbers (mulberry32) so generated values never change between runs.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const money = (r) => (100 + r() * 900).toFixed(1);

const heading = (doc, str, y) => at(doc, str, 72, y, { bold: true, size: 14 });
const cols4 = [{ x: 72 }, { x: 220 }, { x: 400, align: "right" }, { x: 480, align: "right" }];

// --- Separate tables on one page (US-16 in the spec) --------------------------------------------
await write("separate-tables", {}, (d) => {
  heading(d, "Regional results", 740);
  let y = table(
    d,
    cols4,
    [
      { cells: ["Store", "Region", "Q1", "Q2"], bold: true },
      ["Portland", "West", "412.8", "430.1"],
      ["Denver", "Mountain", "388.1", "391.7"],
      ["Austin", "South", "501.2", "522.9"],
    ],
    710,
  );
  y = prose(
    d,
    [
      "Headcount is reported separately below. Figures are full-time equivalents",
      "at the end of each quarter and exclude seasonal contractors.",
    ],
    72,
    y - 20,
  );
  table(
    d,
    [{ x: 72 }, { x: 300, align: "right" }, { x: 400, align: "right" }],
    [
      { cells: ["Team", "Staff", "Open roles"], bold: true },
      ["Engineering", "42", "6"],
      ["Support", "18", "2"],
      ["Sales", "25", "4"],
    ],
    y - 24,
  );
});

// --- Wrapped cells, including in right-aligned columns ------------------------------------------
await write("wrapped-cells", {}, (d) => {
  heading(d, "Facilities requests", 740);
  table(
    d,
    [{ x: 72 }, { x: 150 }, { x: 420, align: "right" }, { x: 520, align: "right" }],
    [
      { cells: ["Ref", "Description", "Owner", "Cost"], bold: true },
      [
        "F-101",
        ["Replace lobby carpet tiles and", "reseal the entrance mat well"],
        "Facilities",
        "1,240.00",
      ],
      ["F-102", "Repaint stairwell B", ["Building", "services team"], "860.50"],
      [
        "F-103",
        ["Service rooftop HVAC units before", "the summer peak"],
        ["External", "contractor"],
        "4,310.75",
      ],
      ["F-104", "Fix badge reader at loading dock", "Security", "295.00"],
    ],
    710,
  );
});

// --- Section Headers ------------------------------------------------------------------------------
await write("section-headers", {}, (d) => {
  heading(d, "Sales by store", 740);
  table(
    d,
    cols4,
    [
      { cells: ["Store", "Manager", "Q1", "Q2"], bold: true },
      { section: "West" },
      ["Portland", "A. Rivera", "412.8", "430.1"],
      ["Seattle", "J. Chen", "455.0", "470.3"],
      { section: "Central" },
      ["Denver", "M. Okafor", "388.1", "391.7"],
      ["Omaha", "L. Novak", "301.4", "310.0"],
      { section: "East" },
      ["Boston", "S. Patel", "520.6", "533.2"],
      ["Raleigh", "D. Kim", "344.9", "362.5"],
    ],
    710,
  );
});

// --- A section crossing a page break (the header is not repeated) ----------------------------------
await write("section-page-break", {}, (d) => {
  heading(d, "Inventory by warehouse", 740);
  table(
    d,
    cols4,
    [
      { cells: ["Item", "Warehouse", "Units", "Value"], bold: true },
      { section: "North" },
      ["Bolts", "Fargo", "1200", "360.0"],
      ["Nuts", "Fargo", "1850", "277.5"],
      { section: "South" },
      ["Washers", "Tulsa", "900", "90.0"],
      ["Rivets", "Tulsa", "4000", "520.0"],
    ],
    710,
  );
  d.addPage();
  table(
    d,
    cols4,
    [
      ["Screws", "Tulsa", "2600", "468.0"],
      ["Anchors", "El Paso", "700", "175.0"],
      { section: "East" },
      ["Hinges", "Albany", "320", "960.0"],
      ["Brackets", "Albany", "540", "702.0"],
    ],
    740,
  );
});

// --- A table continuing over three pages with its Header Row repeated -------------------------------
await write("repeated-header", {}, (d) => {
  const r = rng(7);
  const cities = ["Akron", "Boise", "Camden", "Dayton", "Eugene", "Fresno", "Gary", "Hilo"];
  let n = 0;
  for (let p = 0; p < 3; p++) {
    if (p) d.addPage();
    if (p === 0) heading(d, "Monthly orders", 740);
    const rows = [{ cells: ["Order", "City", "Units", "Total"], bold: true }];
    for (let i = 0; i < 6; i++, n++)
      rows.push([`A-${1001 + n}`, cities[n % 8], String(10 + Math.floor(r() * 90)), money(r)]);
    table(d, cols4, rows, p === 0 ? 710 : 740);
  }
});

// --- Consecutive unrelated tables: page 2 opens with its own, different bold header ------------------
await write("unrelated-tables", {}, (d) => {
  heading(d, "Fleet", 740);
  table(
    d,
    cols4,
    [
      { cells: ["Vehicle", "Depot", "Miles", "Fuel"], bold: true },
      ["Van 12", "Leeds", "1820", "212.4"],
      ["Van 14", "York", "2210", "260.9"],
      ["Truck 3", "Hull", "3105", "498.0"],
    ],
    710,
  );
  d.addPage();
  table(
    d,
    [{ x: 72 }, { x: 260 }, { x: 480, align: "right" }],
    [
      { cells: ["Driver", "Licence", "Years"], bold: true },
      ["R. Patel", "C1", "12"],
      ["K. Moss", "C", "4"],
      ["T. Jones", "B", "7"],
    ],
    740,
  );
});

// --- Body text after the first table and before the second: not joined -------------------------------
await write("prose-between-pages", {}, (d) => {
  heading(d, "Quarterly costs", 740);
  const y = table(
    d,
    cols4,
    [
      { cells: ["Cost", "Centre", "Q1", "Q2"], bold: true },
      ["Rent", "HQ", "120.0", "120.0"],
      ["Power", "HQ", "31.5", "28.9"],
      ["Cloud", "IT", "88.2", "93.4"],
    ],
    710,
  );
  prose(
    d,
    [
      "Costs rose in the second quarter, mostly from cloud usage. The finance team",
      "expects this to level off once the migration finishes. A full breakdown by",
      "vendor follows on the next page, after the commentary from each centre.",
    ],
    72,
    y - 20,
  );
  d.addPage();
  prose(
    d,
    [
      "Vendor spend is shown for the same two quarters. Amounts are in thousands",
      "and include tax. Vendors under one thousand are grouped as Other.",
      "Contract renewals are flagged separately in the procurement report.",
    ],
    72,
    740,
  );
  table(
    d,
    cols4,
    [
      ["Acme", "IT", "40.1", "44.0"],
      ["Globex", "HQ", "22.7", "21.9"],
      ["Other", "IT", "9.3", "9.8"],
    ],
    680,
  );
});

// --- Embedded bold font: the Header Row uses Lato Bold, embedded as a subset -------------------------
// pdf.js 6 reports bold for embedded fonts only through the font name with fontExtraProperties.
await write("embedded-bold", {}, (d) => {
  heading(d, "Branch staffing", 740);
  table(
    d,
    cols4,
    [
      { cells: ["Branch", "Lead", "Staff", "Budget"], font: "EmbeddedBold" },
      ["Leeds", "P. Grant", "14", "410.0"],
      ["York", "H. Ito", "9", "265.5"],
      ["Hull", "E. Shaw", "11", "320.25"],
    ],
    710,
  );
});

// --- Rows stored as one string with runs of spaces, written by pdfkit --------------------------------
// pdf.js splits these strings into separate items itself, so this does NOT exercise the US-14 split
// (single-string-rows.pdf below does). It pins that pdf.js behaviour.
// Cells are padded to fixed character counts so the columns roughly line up.
const spaced = (cells) => cells[0].padEnd(24) + cells[1].padEnd(16) + cells[2];
await write("spaced-strings-pdfkit", {}, (d) => {
  at(d, spaced(["Store", "Region", "Q1"]), 72, 700, { bold: true });
  at(d, spaced(["Portland Pearl", "West", "412.8"]), 72, 686);
  at(d, spaced(["Denver", "Mountain", "388.1"]), 72, 672);
});

// --- Rows stored as one string (US-14), hand-built: see single-string-rows.mjs -----------------------
// Cells padded to fixed character columns, as fixed-width report output is.
const fixed = (cells) =>
  cells.map((c, i) => (i < cells.length - 1 ? c.padEnd([20, 12, 9][i]) : c)).join("");
writeFileSync(
  join(outDir, "single-string-rows.pdf"),
  buildSingleStringRowsPdf([
    { text: "Store results", x: 72, y: 740, size: 14, bold: true },
    { text: fixed(["Store", "Region", "Q1", "Q2"]), x: 72, y: 710, bold: true },
    { text: fixed(["Portland Pearl", "West", "412.8", "430.1"]), x: 72, y: 696 },
    { text: fixed(["Boise  Downtown", "Mountain", "388.1", "391.7"]), x: 72, y: 682 }, // 2 spaces stay in the cell
    { text: fixed(["Austin", "South", "501.2", "522.9"]), x: 72, y: 668 },
  ]),
);

// --- Errors ------------------------------------------------------------------------------------------
// Default pdfVersion 1.3 => RC4 40-bit, which uses no random bytes (AES would).
await write("encrypted", { userPassword: "secret" }, (d) => {
  table(
    d,
    cols4,
    [{ cells: ["Hidden", "Table", "1", "2"], bold: true }, ["a", "b", "3", "4"]],
    700,
  );
});

// A greyscale PNG built in memory, so the page has an image and no text operators at all.
function png(w, h) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (t, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(t), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth; colour type 0 = greyscale
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = (x ^ y) & 0xff;
  const sig = Buffer.from([0x89, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
await write("image-only", {}, (d) => d.image(png(200, 100), 72, 72, { width: 400 }));

writeFileSync(join(outDir, "not-a-pdf.pdf"), "This is a plain text file with a .pdf name.\n");

// --- 200 pages for the re-detection benchmark: one table continuing over every page ------------------
await write("perf-200-pages", {}, (d) => {
  const r = rng(200);
  const regions = ["North", "South", "East", "West"];
  let n = 0;
  for (let p = 0; p < 200; p++) {
    if (p) d.addPage();
    const rows = [{ cells: ["Invoice", "Region", "Qty", "Amount"], bold: true }];
    for (let i = 0; i < 12; i++, n++)
      rows.push([`INV-${10001 + n}`, regions[n % 4], String(1 + Math.floor(r() * 50)), money(r)]);
    table(d, cols4, rows, 740);
  }
});

// --- Example Document: byte-for-byte from the prototype ----------------------------------------------
const proto = readFileSync(join(root, "tests", "golden", "harness", "prototype.html"), "utf8");
const b64 = proto.match(/const SAMPLE_B64 = "([A-Za-z0-9+/=]+)";/)?.[1];
if (!b64) throw new Error("SAMPLE_B64 not found in prototype.html");
writeFileSync(join(exampleDir, "example-document.pdf"), Buffer.from(b64, "base64"));

console.log(`Fixtures written to ${outDir}, the Example Document to ${exampleDir}`);
