// Runs engine-snapshot.ts through Vite, which resolves the app's TypeScript sources.
// Usage: npm run golden:engine
import { join } from "node:path";
import { runnerImport } from "vite";

await runnerImport(join(import.meta.dirname, "engine-snapshot.ts"));
