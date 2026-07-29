"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const OPENERS = [
  "A laptop for university under GH₵9,000",
  "What does a MacBook really cost imported?",
  "Fridge that fits a small kitchen",
  "Compare the best noise-cancelling headphones",
];

export function ConciergePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activity]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      setError(null);
      setInput("");
      setBusy(true);
      setActivity(null);

      const history = [...messages, { role: "user" as const, text: trimmed }];
      setMessages([...history, { role: "assistant", text: "" }]);

      try {
        const response = await fetch("/api/ai/concierge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.text })),
            conversationId: conversationRef.current,
          }),
        });

        if (!response.ok || !response.body) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.error ?? `Request failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // NDJSON arrives in arbitrary chunks, so a partial line at the end of
        // one chunk must be carried into the next rather than parsed.
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: { type: string; text?: string; label?: string; message?: string; conversationId?: string };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }

            if (event.type === "text" && event.text) {
              const delta = event.text;
              setActivity(null);
              setMessages((current) => {
                const next = [...current];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, text: last.text + delta };
                }
                return next;
              });
            } else if (event.type === "tool") {
              setActivity(event.label ?? "Looking that up");
            } else if (event.type === "done") {
              conversationRef.current = event.conversationId;
              setActivity(null);
            } else if (event.type === "error") {
              setError(event.message ?? "Something went wrong");
            }
          }
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Something went wrong");
        // Drop the empty assistant bubble so the panel doesn't show a blank turn.
        setMessages((current) => {
          const last = current[current.length - 1];
          return last && last.role === "assistant" && last.text === "" ? current.slice(0, -1) : current;
        });
      } finally {
        setBusy(false);
        setActivity(null);
      }
    },
    [busy, messages],
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      title="Nyansa concierge"
      description="Knows the catalog, the prices, and what importing actually costs."
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]">
                <Sparkles className="size-4 text-brass-500" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-content-secondary">
                Tell me what you&rsquo;re looking for and roughly what you want to spend. I&rsquo;ll
                search real stock, and if something is better bought locally than imported I&rsquo;ll
                say so.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {OPENERS.map((opener) => (
                <button
                  key={opener}
                  type="button"
                  onClick={() => void send(opener)}
                  className="rounded-xl border border-line px-3.5 py-2.5 text-left text-sm text-content-secondary transition-colors hover:border-line-accent hover:bg-surface-sunken hover:text-content"
                >
                  {opener}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[88%] text-sm leading-relaxed",
                  message.role === "user"
                    ? "ml-auto rounded-2xl rounded-br-sm bg-surface-inverse px-3.5 py-2.5 text-content-inverse"
                    : "whitespace-pre-wrap text-content",
                )}
              >
                {message.text ||
                  (message.role === "assistant" && busy ? (
                    <span className="inline-flex items-center gap-2 text-content-tertiary">
                      <Spinner className="size-3.5" />
                      Thinking
                    </span>
                  ) : null)}
              </div>
            ))}
            {activity ? (
              <p className="inline-flex items-center gap-2 text-xs text-content-tertiary">
                <Spinner className="size-3" />
                {activity}…
              </p>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="mt-4 rounded-xl bg-negative-surface px-3.5 py-2.5 text-sm text-negative">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="border-t border-line p-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-sunken p-2 focus-within:border-line-accent">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Ask about anything in the store…"
            aria-label="Message the concierge"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-content-tertiary"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-contrast transition-opacity disabled:opacity-40"
          >
            {busy ? <Spinner className="size-4" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
