// Hand-built PDF for US-14: every table row is ONE text item whose string holds runs of spaces
// between the columns, the way some report generators write tables.
//
// pdfkit can't make this. pdf.js turns every glyph whose Unicode text starts with whitespace into a
// gap, and splits the item itself when the gap is wide, so literal space runs never reach the PDF
// Reader. The trick: the last character before each run is drawn with an extra code that
//   - draws the real glyph (an /Encoding /Differences entry, e.g. 0x80 -> /e),
//   - advances by the glyph plus the spaces (/Widths), so the page looks like spaced columns,
//   - maps in /ToUnicode to the character followed by the spaces ("e   ").
// pdf.js keeps that glyph verbatim, so the item's str is e.g. "Store   Region   Q1".
//
// Every space run is encoded this way, single spaces and 2-space runs too (both must stay inside one
// cell). A plain 0x20 byte would become a gap, and in Courier a one-space gap is exactly pdf.js 6's
// split threshold (0.6 x font size), so the item could break apart. The default font is Courier: real PDFs like this are usually fixed-width report
// output, where padding to a character count lines the columns up.
import PDFDocument from "pdfkit";

const GLYPH = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  ".": "period",
  ",": "comma",
  ")": "parenright",
  "%": "percent",
};
const glyphName = (ch) => (/[A-Za-z]/.test(ch) ? ch : GLYPH[ch]);
const hex4 = (s) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("");

// Width of each character in 1/1000 em, from pdfkit's built-in AFM metrics.
function metrics(fontName) {
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.font(fontName).fontSize(1000);
  return (ch) => doc.widthOfString(ch);
}

// One simple font: WinAnsi codes 32..126 as usual, plus one extra code per (char, run length).
function makeFont(baseFont) {
  const width = metrics(baseFont);
  const extra = []; // { code, ch, spaces }
  const codeFor = (ch, spaces) => {
    let e = extra.find((x) => x.ch === ch && x.spaces === spaces);
    if (!e) {
      if (!glyphName(ch)) throw new Error(`no glyph name for ${JSON.stringify(ch)} before a run`);
      e = { code: 0x80 + extra.length, ch, spaces };
      extra.push(e);
    }
    return e.code;
  };
  // Encode a row string as font bytes.
  const encode = (text) => {
    let out = "";
    const re = /(\S)( +)|([^\n])/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) out += String.fromCharCode(codeFor(m[1], m[2].length));
      else out += m[3];
    }
    return out;
  };
  const objects = () => {
    const last = 0x80 + extra.length - 1;
    const widths = [];
    for (let c = 32; c <= Math.max(126, last); c++) {
      const e = extra.find((x) => x.code === c);
      if (e) widths.push(Math.round(width(e.ch) + e.spaces * width(" ")));
      else widths.push(c <= 126 ? Math.round(width(String.fromCharCode(c))) : 0);
    }
    const diffs = extra.map((e) => `/${glyphName(e.ch)}`).join(" ");
    const bf = extra.map((e) => `<${e.code.toString(16)}> <${hex4(e.ch + " ".repeat(e.spaces))}>`);
    const cmap = [
      "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
      "/CMapName /TableLift-US14 def /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
      "1 begincodespacerange <00> <FF> endcodespacerange",
      `${bf.length} beginbfchar`,
      ...bf,
      "endbfchar",
      "1 beginbfrange <20> <7e> <0020> endbfrange",
      "endcmap CMapName currentdict /CMap defineresource pop end end",
    ].join("\n");
    return {
      font: `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /FirstChar 32 /LastChar ${32 + widths.length - 1} /Widths [${widths.join(" ")}] /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${diffs}] >> /ToUnicode {CMAP} >>`,
      cmap,
    };
  };
  return { encode, objects };
}

const pdfString = (bytes) => "(" + bytes.replace(/[\\()]/g, (c) => "\\" + c) + ")";

/**
 * Build the PDF bytes.
 * @param {{ text: string, x: number, y: number, bold?: boolean, size?: number }[]} lines
 *   one text item each, baseline at PDF coordinate (x, y) on a Letter page
 * @param {{ regular?: string, bold?: string }} [fonts] standard 14 font names
 * @returns {Buffer}
 */
export function buildSingleStringRowsPdf(lines, fonts = {}) {
  const regular = makeFont(fonts.regular ?? "Courier");
  const bold = makeFont(fonts.bold ?? "Courier-Bold");
  const ops = lines.map(({ text, x, y, bold: b = false, size = 9 }) => {
    const f = b ? bold : regular;
    return `BT /${b ? "F2" : "F1"} ${size} Tf ${x} ${y} Td ${pdfString(f.encode(text))} Tj ET`;
  });
  const content = ops.join("\n");
  const fr = regular.objects(),
    fb = bold.objects();
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 7 0 R >> >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    fr.font.replace("{CMAP}", "6 0 R"),
    `<< /Length ${fr.cmap.length} >>\nstream\n${fr.cmap}\nendstream`,
    fb.font.replace("{CMAP}", "8 0 R"),
    `<< /Length ${fb.cmap.length} >>\nstream\n${fb.cmap}\nendstream`,
    `<< /Title (Single-string rows) /Producer (Table Lift fixtures) >>`,
  ];
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  pdf += offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
