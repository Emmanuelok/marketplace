/**
 * The agent loop.
 *
 * Written by hand rather than using the SDK's beta tool runner, because this
 * loop needs to persist an audit trail per turn, execute tools concurrently,
 * and degrade cleanly when the database is unavailable — all of which sit
 * awkwardly inside the runner's per-turn hooks.
 *
 * Three details are easy to get wrong and are load-bearing here:
 *   - The FULL `response.content` is appended to history, not just the text.
 *     Dropping tool_use blocks breaks the next turn with a 400.
 *   - ALL tool_results go back in a SINGLE user message. Splitting them across
 *     messages silently trains the model to stop making parallel tool calls.
 *   - `stop_reason` is checked BEFORE reading content, because a refusal
 *     returns HTTP 200 with an empty content array.
 */

import type Anthropic from "@anthropic-ai/sdk";

import { newId } from "@/lib/ids";
import { db, agentMessages, agentRuns } from "@/server/db";
import { anthropic, defaultModel, isAiConfigured } from "./client";
import { getAgent, type AgentKey } from "./registry";
import { executeTool, toolDefinitions, type ToolContext } from "./tools";

const MAX_ITERATIONS = 12;

export interface RunAgentInput {
  messages: Anthropic.MessageParam[];
  userId?: string;
  conversationId?: string;
  context?: ToolContext;
}

export interface ToolCallRecord {
  name: string;
  ms: number;
  ok: boolean;
}

export interface AgentResult {
  runId: string;
  conversationId: string;
  text: string;
  /** Present when the agent has an `outputSchema` and returned valid JSON. */
  structured: unknown | null;
  toolCalls: ToolCallRecord[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  stopReason: string | null;
  refused: boolean;
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "The AI assistant is not configured on this deployment. Set ANTHROPIC_API_KEY to enable it.",
    );
    this.name = "AiNotConfiguredError";
  }
}

// --- Request construction ---------------------------------------------------

/**
 * The SDK's published types lag the API for `output_config` (effort and
 * structured-output format). The values are correct per the current API; the
 * cast is confined to this one function so it cannot spread.
 */
function buildParams(
  key: AgentKey,
  messages: Anthropic.MessageParam[],
): Anthropic.MessageCreateParams {
  const agent = getAgent(key);
  const tools = toolDefinitions(agent.tools);

  const outputConfig: Record<string, unknown> = { effort: agent.effort };
  if (agent.outputSchema) {
    outputConfig.format = { type: "json_schema", schema: agent.outputSchema };
  }

  const params = {
    model: defaultModel(),
    max_tokens: agent.maxTokens,
    // Adaptive thinking is on by default on Opus 5; stating it explicitly keeps
    // the request self-documenting. `budget_tokens` is removed on this model
    // and returns a 400, and temperature/top_p/top_k are likewise rejected.
    thinking: { type: "adaptive" },
    output_config: outputConfig,
    system: [
      {
        type: "text",
        text: agent.systemPrompt,
        // The system prompt is large and byte-stable, so it is worth caching.
        // Anything volatile must go in the messages, after this breakpoint.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
    ...(tools.length > 0 ? { tools } : {}),
  } as unknown as Anthropic.MessageCreateParams;

  return params;
}

function extractText(content: readonly Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function toolUseBlocks(content: readonly Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] {
  return content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
}

// --- Non-streaming run ------------------------------------------------------

export async function runAgent(key: AgentKey, input: RunAgentInput): Promise<AgentResult> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  const agent = getAgent(key);
  const runId = newId("agentRun");
  const conversationId = input.conversationId ?? newId("conversation");
  const startedAt = Date.now();

  const messages: Anthropic.MessageParam[] = [...input.messages];
  const toolCalls: ToolCallRecord[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  let finalText = "";
  let stopReason: string | null = null;
  let refused = false;

  await recordRunStart(runId, key, conversationId, input);

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
      const stream = anthropic().messages.stream(buildParams(key, messages));
      const response = await stream.finalMessage();

      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      stopReason = response.stop_reason;

      // Check the stop reason before touching content — a refusal is a 200 with
      // an empty content array, so `content[0].text` would throw.
      if (response.stop_reason === "refusal") {
        refused = true;
        finalText =
          "I can't help with that request. If you think this is a mistake, our support team can pick it up.";
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      // A server tool hit its iteration cap; re-send to let it continue.
      if (response.stop_reason === "pause_turn") continue;

      const pending = toolUseBlocks(response.content);
      if (pending.length === 0) {
        finalText = extractText(response.content);
        break;
      }

      // Execute concurrently — a comparison typically fans out to three
      // lookups, and running them in series triples the wait for no reason.
      const results = await Promise.all(
        pending.map(async (block) => {
          const began = Date.now();
          const { result, isError } = await executeTool(
            block.name,
            block.input,
            input.context ?? { userId: input.userId },
          );
          toolCalls.push({ name: block.name, ms: Date.now() - began, ok: !isError });
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: JSON.stringify(result),
            is_error: isError,
          };
        }),
      );

      // All results in one user message — splitting them suppresses future
      // parallel tool use.
      messages.push({ role: "user", content: results });

      if (iteration === MAX_ITERATIONS - 1) {
        finalText =
          "I wasn't able to finish looking that up. Could you narrow the question a little?";
      }
    }

    const structured = agent.outputSchema ? safeParseJson(finalText) : null;

    await recordRunFinish(runId, {
      status: refused ? "needs_review" : "succeeded",
      output: { text: finalText, structured },
      toolCalls,
      usage,
      latencyMs: Date.now() - startedAt,
    });
    await recordMessages(conversationId, runId, messages);

    return {
      runId,
      conversationId,
      text: finalText,
      structured,
      toolCalls,
      usage,
      stopReason,
      refused,
    };
  } catch (error) {
    await recordRunFinish(runId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      toolCalls,
      usage,
      latencyMs: Date.now() - startedAt,
    });
    throw error;
  }
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// --- Streaming run ----------------------------------------------------------

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "done"; runId: string; conversationId: string }
  | { type: "error"; message: string };

/** Human-readable labels so the UI can say what the agent is doing. */
const TOOL_LABELS: Record<string, string> = {
  search_products: "Searching the catalog",
  get_product: "Reading the product details",
  compare_products: "Comparing options",
  quote_landed_cost: "Calculating the import cost",
  get_categories: "Checking categories",
  get_brands: "Checking brands",
  estimate_delivery: "Estimating delivery",
  get_fx_rate: "Checking the exchange rate",
};

/**
 * Newline-delimited JSON, one event per line. Chosen over SSE because the
 * client only needs one direction and NDJSON survives proxies that mangle
 * `text/event-stream` framing.
 */
export function streamAgent(key: AgentKey, input: RunAgentInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      if (!isAiConfigured()) {
        emit({ type: "error", message: new AiNotConfiguredError().message });
        controller.close();
        return;
      }

      const runId = newId("agentRun");
      const conversationId = input.conversationId ?? newId("conversation");
      const startedAt = Date.now();
      const messages: Anthropic.MessageParam[] = [...input.messages];
      const toolCalls: ToolCallRecord[] = [];
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

      await recordRunStart(runId, key, conversationId, input);

      try {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
          const stream = anthropic().messages.stream(buildParams(key, messages));

          stream.on("text", (delta) => emit({ type: "text", text: delta }));

          const response = await stream.finalMessage();
          usage.inputTokens += response.usage.input_tokens;
          usage.outputTokens += response.usage.output_tokens;
          usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

          if (response.stop_reason === "refusal") {
            emit({
              type: "text",
              text: "I can't help with that one. Our support team can pick it up if you think that's wrong.",
            });
            break;
          }

          messages.push({ role: "assistant", content: response.content });
          if (response.stop_reason === "pause_turn") continue;

          const pending = toolUseBlocks(response.content);
          if (pending.length === 0) break;

          for (const block of pending) {
            emit({
              type: "tool",
              name: block.name,
              label: TOOL_LABELS[block.name] ?? "Looking that up",
            });
          }

          const results = await Promise.all(
            pending.map(async (block) => {
              const began = Date.now();
              const { result, isError } = await executeTool(
                block.name,
                block.input,
                input.context ?? { userId: input.userId },
              );
              toolCalls.push({ name: block.name, ms: Date.now() - began, ok: !isError });
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: JSON.stringify(result),
                is_error: isError,
              };
            }),
          );
          messages.push({ role: "user", content: results });
        }

        await recordRunFinish(runId, {
          status: "succeeded",
          toolCalls,
          usage,
          latencyMs: Date.now() - startedAt,
        });
        await recordMessages(conversationId, runId, messages);
        emit({ type: "done", runId, conversationId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        await recordRunFinish(runId, {
          status: "failed",
          error: message,
          toolCalls,
          usage,
          latencyMs: Date.now() - startedAt,
        });
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
}

// --- Audit trail ------------------------------------------------------------
// Logging must never break the user-facing response, so every write is
// individually swallowed. An unreachable database degrades observability, not
// the product.

async function recordRunStart(
  runId: string,
  key: AgentKey,
  conversationId: string,
  input: RunAgentInput,
): Promise<void> {
  try {
    await db.insert(agentRuns).values({
      id: runId,
      agentKey: key,
      status: "running",
      userId: input.userId ?? null,
      conversationId,
      model: defaultModel(),
      input: { messageCount: input.messages.length },
    });
  } catch {
    /* observability is best-effort */
  }
}

async function recordRunFinish(
  runId: string,
  data: {
    status: "succeeded" | "failed" | "needs_review";
    output?: Record<string, unknown>;
    error?: string;
    toolCalls: ToolCallRecord[];
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
    latencyMs: number;
  },
): Promise<void> {
  try {
    const { eq } = await import("drizzle-orm");
    await db
      .update(agentRuns)
      .set({
        status: data.status,
        output: data.output ?? null,
        error: data.error ?? null,
        toolCalls: data.toolCalls,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        cacheReadTokens: data.usage.cacheReadTokens,
        costUsdMinor: estimateCostUsdMinor(data.usage),
        latencyMs: data.latencyMs,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId));
  } catch {
    /* observability is best-effort */
  }
}

async function recordMessages(
  conversationId: string,
  runId: string,
  messages: Anthropic.MessageParam[],
): Promise<void> {
  try {
    // Only the last exchange is new; earlier turns were persisted on prior runs.
    const tail = messages.slice(-2);
    if (tail.length === 0) return;
    await db.insert(agentMessages).values(
      tail.map((message) => ({
        id: newId("agentMessage"),
        conversationId,
        runId,
        role: message.role,
        content: Array.isArray(message.content)
          ? (message.content as unknown[])
          : [{ type: "text", text: String(message.content) }],
      })),
    );
  } catch {
    /* observability is best-effort */
  }
}

/** Claude Opus 5: $5 / MTok in, $25 / MTok out, cache reads at 10% of input. */
export function estimateCostUsdMinor(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}): number {
  const dollars =
    (usage.inputTokens * 5) / 1_000_000 +
    (usage.outputTokens * 25) / 1_000_000 +
    (usage.cacheReadTokens * 0.5) / 1_000_000;
  return Math.round(dollars * 100);
}
