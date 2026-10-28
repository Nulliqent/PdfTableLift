# Table Lift

Lift tables out of text-based PDFs, entirely on your device. The PDF never leaves the browser.

## Run on localhost

Requires Node 22 or later and Python 3 (for the commit-message hook).

```sh
npm install            # also installs the git hooks
npm run dev            # dev server with hot reload, http://localhost:5173
```

Production-like run:

```sh
npm run build
npm run preview        # http://localhost:8080
```

## Verify

```sh
npx playwright install webkit chromium   # once, for the browser tests
npm run check
```

`npm run check` runs, in order:

| Script               | What it does                                                    |
| -------------------- | --------------------------------------------------------------- |
| `npm run typecheck`  | `tsc -b` over the app and the Node-side files                    |
| `npm run lint`       | ESLint (including module-boundary rules) and Prettier `--check` |
| `npm run test`       | Vitest unit tests in Node (`tests/unit`)                         |
| `npm run test:e2e`   | Playwright in WebKit and Chromium against the preview build      |

`npm run format` rewrites files with Prettier.

## Fixtures and golden snapshots

```sh
npm run fixtures   # regenerate the test PDFs (tests/fixtures) and public/example-document.pdf
npm run golden     # re-record what the prototype produces for them on pdf.js 3.11
```

See [tests/golden/README.md](tests/golden/README.md) for the fixture list, the snapshot format and
how the harness works.

## Git hooks

`npm install` installs them with `simple-git-hooks`:

- **commit-msg** checks the message against Conventional Commits with
  `.claude/skills/commit-convention-comply/scripts/check_commit_msg.py`.
- **pre-push** runs `npm run check`.

After changing the `simple-git-hooks` block in `package.json`, run `npx simple-git-hooks` to reinstall.

## Layout

```
src/
  main.tsx          entry point
  shared/           PageText types shared by the PDF Reader and the Engine
  pdf-reader/       the only code that touches pdf.js
  engine/           pure TypeScript: detection, joining, Regions, export, workspace reducer
  ui/               React components (CSS Modules) and global design tokens
scripts/fixtures/   fixture PDF generator (pdfkit) and its font
tests/
  unit/             Vitest (seams A and B)
  e2e/              Playwright (seam C)
  fixtures/         generated fixture PDFs (committed)
  golden/           golden snapshots and the dev-only pdf.js 3.11 harness that records them
```

Dependencies flow one way: UI → Engine and UI → PDF Reader. ESLint fails if the Engine imports
pdf.js, React, the DOM or another module.
