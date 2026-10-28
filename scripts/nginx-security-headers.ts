// Prints the nginx `add_header` lines for SECURITY_HEADERS, so nginx and `vite preview` send the
// same text. The Docker build runs it (`node scripts/nginx-security-headers.ts`) and
// nginx/default.conf includes the output at server level.
import { SECURITY_HEADERS } from "../security-headers.ts";

const lines = Object.entries(SECURITY_HEADERS).map(([name, value]) => {
  // Inside an nginx double-quoted string, `"` and `\` need escaping and `$` starts a variable.
  if (/["\\$\n]/.test(value)) throw new Error(`${name} has a character nginx would misread`);
  return `add_header ${name} "${value}" always;`;
});

process.stdout.write(
  "# Generated from security-headers.ts by scripts/nginx-security-headers.ts. Don't edit.\n" +
    `${lines.join("\n")}\n`,
);
