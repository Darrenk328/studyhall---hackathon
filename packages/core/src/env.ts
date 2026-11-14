import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

let loaded = false;
let envRoot: string | undefined;

/** Directory of the loaded `.env` (the repo root in dev), or cwd. */
export function projectRoot(): string {
  return envRoot ?? process.cwd();
}

/**
 * Load the nearest `.env` (walking up from cwd) into process.env, once.
 * Existing environment variables win over the file.
 */
export function loadEnv(startDir: string = process.cwd()): string | undefined {
  if (loaded) return undefined;
  loaded = true;
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      envRoot = dir;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export class MissingEnvError extends Error {
  constructor(readonly variable: string, hint: string) {
    super(`${variable} is not set. ${hint}`);
    this.name = "MissingEnvError";
  }
}

const HINTS: Record<string, string> = {
  YDC_API_KEY: "Add your You.com API key to .env (see .env.example).",
  ANTHROPIC_API_KEY: "Add your Anthropic API key to .env (see .env.example).",
};

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new MissingEnvError(name, HINTS[name] ?? "Set it in .env.");
  return value;
}

export function envFlag(name: string, fallback = false): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true" || v === "yes";
}
