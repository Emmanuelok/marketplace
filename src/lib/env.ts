/**
 * Environment access.
 *
 * Reading `process.env` directly is banned outside this module. Everything is
 * validated once, lazily, so that a missing optional key (e.g. no Anthropic
 * credentials in CI) produces a clear error at the point of use rather than a
 * crash at import time.
 */

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32).optional(),

  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),

  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),

  FX_PROVIDER_URL: z.string().optional(),
  FX_PROVIDER_KEY: z.string().optional(),
  FX_SPREAD_BPS: z.coerce.number().int().min(0).max(5000).default(250),

  FEATURE_ORDER_TO_SHIP: z.coerce.boolean().default(true),
  FEATURE_AI_CONCIERGE: z.coerce.boolean().default(true),
  FEATURE_VENDOR_PORTAL: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Read a variable that a feature genuinely cannot run without. Throws a message
 * naming the variable and the feature, so the failure is self-explanatory.
 */
export function requireEnv<K extends keyof Env>(key: K, feature: string): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `${String(key)} is not set, but it is required for ${feature}. ` +
        `Add it to .env.local — see .env.example for the full list.`,
    );
  }
  return value as NonNullable<Env[K]>;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}

export function isConfigured(key: keyof Env): boolean {
  const value = env()[key];
  return value !== undefined && value !== null && value !== "";
}
