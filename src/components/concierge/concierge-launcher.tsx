"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { ConciergePanel } from "./concierge-panel";

export function ConciergeLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask the Nyansa concierge"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-line-accent bg-surface-raised px-4 py-3 shadow-[var(--shadow-lifted)] transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)] hover:-translate-y-0.5 sm:bottom-6 sm:right-6"
      >
        <Sparkles className="size-4 text-brass-500" aria-hidden />
        <span className="hidden text-sm font-medium sm:inline">Ask a specialist</span>
      </button>

      <ConciergePanel open={open} onOpenChange={setOpen} />
    </>
  );
}
