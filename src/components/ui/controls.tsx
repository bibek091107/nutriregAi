import type { ReactNode } from "react";
import { Icon } from "./Icon";

/* -------------------------------------------------------------------------- */
/* Buttons                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant =
  | "primary" // bg-secondary / text-on-secondary
  | "solid" // bg-primary / text-on-primary
  | "outline" // surface-container-lowest + hairline
  | "surface" // bg-surface-container
  | "ghost"
  | "danger";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-secondary hover:bg-secondary-container text-on-secondary shadow-sm disabled:hover:bg-secondary",
  solid: "bg-primary hover:bg-on-surface text-on-primary shadow-sm disabled:hover:bg-primary",
  outline:
    "bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant/70 shadow-sm",
  surface: "bg-surface-container hover:bg-surface-container-high text-on-surface",
  ghost: "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
  danger: "bg-error-container text-on-error-container hover:bg-error hover:text-on-error",
};

type ButtonSize = "sm" | "md" | "lg";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-label-sm",
  md: "h-8 px-space-md text-label-md",
  lg: "h-9 px-space-lg text-label-md",
};

export function Button({
  children,
  variant = "outline",
  size = "md",
  icon,
  iconFilled = false,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconFilled?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`rounded font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {icon ? <Icon className="text-[16px]" filled={iconFilled}>{icon}</Icon> : null}
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

export type BadgeTone =
  | "neutral"
  | "muted"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "active";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-container text-on-surface-variant border border-outline-variant/60",
  muted: "bg-surface-container-low text-on-surface-variant border border-outline-variant/60",
  success: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  danger: "bg-error-container text-on-error-container border border-error/30",
  warning: "bg-amber-50 text-amber-800 border border-amber-200",
  info: "bg-blue-50 text-blue-800 border border-blue-200",
  active: "bg-surface-container-high text-secondary border border-secondary/30",
};

export function Badge({
  children,
  tone = "neutral",
  icon,
  iconFilled = false,
  dot,
  dotClassName = "bg-current",
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  icon?: string;
  iconFilled?: boolean;
  dot?: boolean;
  dotClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-medium whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}
    >
      {dot ? <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClassName}`} /> : null}
      {icon ? <Icon className="text-[13px]" filled={iconFilled}>{icon}</Icon> : null}
      {children}
    </span>
  );
}

/** Small uppercase section label used throughout the ledger panels. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
      {children}
    </span>
  );
}
