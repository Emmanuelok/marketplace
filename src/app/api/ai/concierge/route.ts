import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { isAiConfigured } from "@/server/ai/client";
import { streamAgent } from "@/server/ai/run";
import { rateLimit } from "@/server/http/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(40),
  conversationId: z.string().max(64).optional(),
  regionCode: z.string().length(2).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!isAiConfigured()) {
    return Response.json(
      {
        ok: false,
        error:
          "The concierge is not available on this deployment. An ANTHROPIC_API_KEY needs to be configured.",
      },
      { status: 503 },
    );
  }

  // AI calls cost real money per request, so the limiter is not optional here.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const allowed = rateLimit(`concierge:${ip}`, { limit: 20, windowMs: 60_000 });
  if (!allowed.ok) {
    return Response.json(
      { ok: false, error: "Too many requests. Give it a moment and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(allowed.retryAfterMs / 1000)) } },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (error) {
    return Response.json(
      { ok: false, error: "Invalid request body", issues: error instanceof z.ZodError ? error.issues : undefined },
      { status: 400 },
    );
  }

  const messages: Anthropic.MessageParam[] = parsed.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const stream = streamAgent("concierge", {
    messages,
    conversationId: parsed.conversationId,
    context: { regionCode: parsed.regionCode },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Stops nginx buffering the whole stream and defeating the point of it.
      "x-accel-buffering": "no",
    },
  });
}
