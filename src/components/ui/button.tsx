"use client";

import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-contrast hover:bg-accent-hover shadow-[0_1px_2px_rgb(0_0_0/0.12)] active:translate-y-px",
  secondary:
    "bg-surface-inverse text-content-inverse hover:opacity-90 active:translate-y-px",
  outline:
    "border border-line-strong bg-transparent text-content hover:bg-surface-sunken active:translate-y-px",
  ghost: "bg-transparent text-content-secondary hover:bg-surface-sunken hover:text-content",
  danger: "bg-negative text-white hover:opacity-90 active:translate-y-px",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-13 px-7 text-base gap-2.5",
  icon: "size-11 p-0",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /**
   * Render the single child element instead of a <button>, merging classes and
   * props onto it. Lets a <Link> be styled as a button without nesting an <a>
   * inside a <button>, which is invalid HTML and breaks keyboard behaviour.
   */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, asChild = false, children, disabled, ...props },
  ref,
) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-[--radius-control] font-medium whitespace-nowrap",
    "transition-[background-color,color,opacity,transform] duration-200 [transition-timing-function:var(--ease-out-expo)]",
    "disabled:pointer-events-none disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(classes, child.props.className) });
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
});
