"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const SIDES = {
  right: "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=closed]:translate-x-full",
  left: "inset-y-0 left-0 h-full w-full max-w-md border-r data-[state=closed]:-translate-x-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-3xl border-t data-[state=closed]:translate-y-full",
} as const;

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: keyof typeof SIDES;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  title,
  description,
  children,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Remember what had focus so it can be restored when the sheet closes —
  // otherwise focus falls back to <body> and keyboard users lose their place.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const { overflow, paddingRight } = document.body.style;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    // Move focus into the panel on the next frame, once it has rendered.
    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? panelRef.current)?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      restoreFocusRef.current?.focus();
    };
  }, [open, close]);

  // Rendering is portal-based, so nothing runs during SSR.
  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100]" data-state={open ? "open" : "closed"}>
      <div
        className="absolute inset-0 bg-obsidian-1000/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "surface-glass absolute flex flex-col bg-surface-raised shadow-[var(--shadow-lifted)]",
          "transition-transform duration-300 [transition-timing-function:var(--ease-out-expo)]",
          SIDES[side],
          className,
        )}
      >
        {title ? (
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
              {description ? (
                <p className="mt-0.5 text-xs text-content-secondary">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-m-1 rounded-lg p-1 text-content-tertiary transition-colors hover:bg-surface-sunken hover:text-content"
            >
              <X className="size-5" />
            </button>
          </header>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
