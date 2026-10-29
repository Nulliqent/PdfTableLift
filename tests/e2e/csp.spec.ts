import { expect, test } from "@playwright/test";
import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "../../security-headers.ts";
import { openFixture } from "./support/open-fixture";

test("the policy allows only the app's own origin, its worker and its WebAssembly", () => {
  const directives = CONTENT_SECURITY_POLICY.split("; ");

  expect(directives).toContain("default-src 'self'");
  expect(directives).toContain("connect-src 'self'");
  expect(directives).toContain("worker-src 'self'");
  expect(directives).toContain("script-src 'self' 'wasm-unsafe-eval'");
  // No third-party origin, no wildcard, no inline script or eval.
  expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|\*|'unsafe-inline'|'unsafe-eval'/);
});

test("the preview build sends the security headers, and reading a PDF stays within the app's origin", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const offOrigin: string[] = [];
  const missingHeaders: string[] = [];
  const workerResponses: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.protocol !== "blob:" && url.origin !== origin) {
      offOrigin.push(request.url());
    }
  });
  page.on("response", async (response) => {
    if (new URL(response.url()).origin !== origin) return;
    if (/pdf\.worker/.test(response.url())) workerResponses.push(new URL(response.url()).pathname);
    const headers = await response.allHeaders();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (headers[name.toLowerCase()] !== value)
        missingHeaders.push(`${name} on ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });

  // One PDF, one worker: keep the Example Document (a second read) out of this check.
  await page.route("**/example-document.pdf", (route) => route.abort());
  const response = await page.goto("/");

  expect(response?.headers()["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
  await expect(page.getByRole("banner")).toBeVisible();

  // Opening a PDF starts the pdf.js module worker, which loads under the page's CSP and
  // enforces the one on its own .mjs response.
  await openFixture(page, "embedded-bold.pdf");
  await expect(
    page.getByRole("complementary", { name: "Documents" }).getByRole("button", { name: /Table 1/ }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(workerResponses).toHaveLength(1);
  expect(workerResponses[0]).toMatch(/\.mjs$/);
  expect(
    await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations),
  ).toEqual([]);
  expect(missingHeaders).toEqual([]);
  expect(offOrigin).toEqual([]);
});
