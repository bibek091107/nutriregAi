import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Empty / error / loading states drawn from the approved design language.
 * The dashboard "No products yet" panel in the Stitch export is the reference
 * for every empty state here.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center bg-surface-container-lowest rounded border border-outline-variant/60 shadow-sm ${
        compact ? "p-space-lg" : "p-space-xl"
      }`}
    >
      <div
        className={`rounded-full bg-surface-container text-secondary flex items-center justify-center ${
          compact ? "w-12 h-12 mb-space-md" : "w-16 h-16 mb-space-md"
        }`}
      >
        <Icon className={compact ? "text-[24px]" : "text-[32px]"}>{icon}</Icon>
      </div>
      <h3 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
        {title}
      </h3>
      <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mt-1 mb-space-lg">
        {description}
      </p>
      {action ? <div className="flex items-center gap-space-sm flex-wrap justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  compact = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center bg-surface-container-lowest rounded border border-error/30 shadow-sm ${
        compact ? "p-space-lg" : "p-space-xl"
      }`}
    >
      <div className="w-14 h-14 rounded-full bg-error-container/60 text-error flex items-center justify-center mb-space-md">
        <Icon className="text-[28px]">cloud_off</Icon>
      </div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">{title}</h3>
      <p className="font-body-md text-body-md text-on-surface-variant max-w-md mt-1">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-space-md h-8 px-space-md bg-surface-container-lowest hover:bg-surface-container text-on-surface border border-outline-variant/70 rounded font-label-md text-label-md flex items-center gap-1.5 transition-colors"
        >
          <Icon className="text-[16px]">refresh</Icon>
          <span>Retry</span>
        </button>
      ) : null}
    </div>
  );
}

/** Skeleton rows use the design's own surface-container ramp. */
export function LoadingState({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="bg-surface-container-lowest rounded border border-outline-variant/60 shadow-sm p-space-md"
    >
      <div className="flex items-center gap-2 mb-space-md">
        <Icon className="text-[18px] text-secondary animate-spin">progress_activity</Icon>
        <span className="font-label-md text-label-md text-on-surface-variant">{label}</span>
      </div>
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="h-8 rounded bg-surface-container-low animate-pulse"
            style={{ width: `${100 - index * 9}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Inline processing notice used while an analysis or extraction is running. */
export function ProcessingState({ label, detail }: { label: string; detail?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-2.5 p-space-sm rounded border border-outline-variant/50 bg-surface-container-low/60"
    >
      <Icon className="text-[18px] text-secondary animate-spin mt-0.5">sync</Icon>
      <div className="flex flex-col min-w-0">
        <span className="font-label-md text-label-md text-on-surface font-medium">{label}</span>
        {detail ? (
          <span className="font-body-sm text-body-sm text-on-surface-variant">{detail}</span>
        ) : null}
      </div>
    </div>
  );
}
