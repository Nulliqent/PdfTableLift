/// <reference types="vitest/config" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { SECURITY_HEADERS } from "./security-headers.ts";

// pdf.js data the worker fetches at run time: WebAssembly decoders (JPX, JBIG2, ICC colour,
// PostScript functions) and the standard 14 font glyphs used when drawing pages.
const PDFJS_DIRS = ["wasm", "standard_fonts"];
const pdfjsRoot = join(import.meta.dirname, "node_modules", "pdfjs-dist");

/** Serves pdf.js's data directories at /pdfjs/<dir>/ in dev and copies them into the build. */
function pdfjsAssets(): Plugin {
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/pdfjs\/([\w-]+)\/([\w.-]+)$/.exec(req.url?.split("?")[0] ?? "");
        if (!m || !PDFJS_DIRS.includes(m[1]!)) return next();
        try {
          const body = readFileSync(join(pdfjsRoot, m[1]!, m[2]!));
          if (m[2]!.endsWith(".wasm")) res.setHeader("Content-Type", "application/wasm");
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const dir of PDFJS_DIRS) {
        for (const file of readdirSync(join(pdfjsRoot, dir))) {
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${dir}/${file}`,
            source: readFileSync(join(pdfjsRoot, dir, file)),
          });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  // The CSP goes on preview only: the dev server and React Fast Refresh inject inline scripts.
  preview: { port: 8080, strictPort: true, headers: SECURITY_HEADERS },
  test: {
    // Seams A (workspace reducer + export) and B (PDF Reader) run in Node.
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    passWithNoTests: true,
    // Reading every fixture PDF (one has 200 pages) takes a few seconds.
    testTimeout: 60_000,
  },
});
