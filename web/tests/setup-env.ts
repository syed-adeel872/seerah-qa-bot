/**
 * Load local secrets into process.env for the test harness. Next.js loads
 * .env.local automatically at runtime, but vitest does not — so the embedding
 * and LLM clients pick up the same credentials locally. When the file (or a
 * key) is missing the modules simply degrade to their no-key fallbacks.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.replace(/^["']|["']$/g, "");
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}