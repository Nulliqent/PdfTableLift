import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "test-results", "playwright-report", ".claude"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // UI: React in the browser.
  {
    files: ["src/ui/**/*.{ts,tsx}", "src/main.tsx"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // PDF Reader: the only module that touches pdf.js. It never imports the UI or the Engine.
  {
    files: ["src/pdf-reader/**/*.ts"],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/ui", "**/ui/**"], message: "The PDF Reader must not depend on the UI." },
            {
              group: ["**/engine", "**/engine/**"],
              message: "The PDF Reader must not depend on the Engine.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "The PDF Reader has no UI.",
            },
          ],
        },
      ],
    },
  },

  // Engine (and the shared PageText types): pure TypeScript. No DOM, no pdf.js, no React,
  // and no other module.
  {
    files: ["src/engine/**/*.ts", "src/shared/**/*.ts"],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      // Any browser global (window, document, HTMLElement, ...) is undefined here.
      "no-undef": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["pdfjs-dist", "pdfjs-dist/*"],
              message: "The Engine never imports pdf.js; use the PDF Reader's PageText.",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "The Engine has no UI.",
            },
            { group: ["**/ui", "**/ui/**"], message: "The Engine must not depend on the UI." },
            {
              group: ["**/pdf-reader", "**/pdf-reader/**"],
              message: "The Engine must not depend on the PDF Reader.",
            },
          ],
        },
      ],
    },
  },

  // Node-side files: configs, tests, scripts, the fixture generator and the golden harness.
  {
    files: ["*.{js,ts}", "tests/**/*.{ts,mjs}", "scripts/**/*.{js,ts,mjs}"],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
