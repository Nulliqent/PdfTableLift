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

## Run with Docker

You don't need Node, only Docker with Compose:

```sh
docker compose up --build    # http://localhost:8080
docker compose down          # stop it
```

The `Dockerfile` builds the app in a `node:24-alpine` stage, and `nginx:alpine` serves the static
build. It has no API and stores nothing (ADR 0001). Port 8080 is the one `npm run preview` and the
Playwright tests use, so stop the container before you run `npm run check`.

### Content Security Policy

nginx and `npm run preview` both send a strict CSP, so the browser blocks any request that leaves
the app's origin: your PDFs can't be uploaded anywhere. The policy is `default-src 'self'` and
`connect-src 'self'`, `worker-src 'self'` for the pdf.js worker, `'wasm-unsafe-eval'` for pdf.js's
WebAssembly decoders, and no third-party origins.

The headers are defined once, in `security-headers.ts`. `vite.config.ts` reads it for the preview
server, and the Docker build runs `scripts/nginx-security-headers.ts` to write it into nginx. Keep
every `add_header` out of the `location` blocks in `nginx/default.conf`: a location with its own
`add_header` drops the server-level CSP. `tests/e2e/csp.spec.ts` checks the policy, that every
response of the preview build carries it, and that no request leaves the origin.

To check a running container:

```sh
curl -sI http://localhost:8080/ | grep -i content-security-policy
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
tests/
  unit/             Vitest (seams A and B)
  e2e/              Playwright (seam C)
```

Dependencies flow one way: UI → Engine and UI → PDF Reader. ESLint fails if the Engine imports
pdf.js, React, the DOM or another module.
