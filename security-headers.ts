// The one source of the response headers that make "never uploaded" a browser guarantee (ADR 0001).
// `vite preview` sends them (vite.config.ts), the Docker build writes them into nginx
// (scripts/nginx-security-headers.ts) and the Playwright CSP test asserts them. Change them here only.

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the pdf.js worker compile its WebAssembly decoders (JPX, JBIG2, ICC
  // colour, PostScript functions). It doesn't allow eval or new Function.
  "script-src 'self' 'wasm-unsafe-eval'",
  // The pdf.js module worker is served from our own origin.
  "worker-src 'self'",
  // No fetch, XHR or WebSocket leaves the app's origin.
  "connect-src 'self'",
  // Vite inlines small assets as data: URLs; pdf.js may hand back blob: images.
  "img-src 'self' blob: data:",
  // pdf.js falls back to a data: @font-face when the Font Loading API is missing.
  "font-src 'self' data:",
  "style-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
] as const;

export const CONTENT_SECURITY_POLICY = CSP_DIRECTIVES.join("; ");

export const SECURITY_HEADERS = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;
