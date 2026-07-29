import Anthropic from "@anthropic-ai/sdk";

import { env, isConfigured, requireEnv } from "@/lib/env";

let client: Anthropic | null = null;

/**
 * Lazily construct the client. Constructing at module scope would make every
 * route that merely *imports* an agent fail on a deployment without AI
 * credentials, which is the opposite of graceful degradation.
 */
export function anthropic(): Anthropic {
  if (client) return client;
  const apiKey = requireEnv("ANTHROPIC_API_KEY", "the AI agent runtime");
  client = new Anthropic({ apiKey, maxRetries: 2, timeout: 10 * 60 * 1000 });
  return client;
}

export function isAiConfigured(): boolean {
  return isConfigured("ANTHROPIC_API_KEY");
}

export function defaultModel(): string {
  return env().ANTHROPIC_MODEL;
}
