import type { ReactNode } from "react";
import { Icon } from "./Icon";

/** Section card wrapper: the "bg-surface-container-lowest + hairline + shadow" pattern. */
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface-container-lowest rounded border border-outline-variant/60 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

/** Titled panel header used for Recent Products, Quick Actions, Statutory Checklist, etc. */
export function PanelHeader({
  icon,
  title,
  trailing,
  action,
}: {
  icon?: string;
  title: string;
  trailing?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
      <div className="flex items-center gap-2 min-w-0">
        {icon ? <Icon className="text-secondary text-[18px]">{icon}</Icon> : null}
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight truncate">
          {title}
        </h3>
        {trailing}
      </div>
      {action}
    </div>
  );
}

/** Page-level title block: breadcrumbs, headline, target-market context line. */
export function PageHeader({
  breadcrumbs,
  title,
  badge,
  description,
  meta,
  actions,
}: {
  breadcrumbs?: { label: string; href?: string }[];
  title: string;
  badge?: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-lg">
      <div className="flex flex-col min-w-0">
        {breadcrumbs?.length ? (
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm mb-1"
          >
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <Icon className="text-[13px]">chevron_right</Icon>
                ) : null}
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-on-surface">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-on-surface font-semibold">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-space-sm flex-wrap">
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none font-semibold">
            {title}
          </h1>
          {badge ? (
            <span className="font-data-mono text-data-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/40">
              {badge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{description}</p>
        ) : null}
        {meta ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{meta}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-space-sm flex-wrap shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}

/** Metric card: the four compact dashboard stat cards. */
export function MetricCard({
  label,
  value,
  unit,
  note,
  icon,
  tone = "neutral",
  status,
}: {
  label: string;
  value: number | string;
  unit?: string;
  note?: string;
  icon: string;
  tone?: "neutral" | "error" | "active";
  status?: { text: string; className: string; icon?: string; pulse?: boolean };
}) {
  const valueTone =
    tone === "error" ? "text-error" : tone === "active" ? "text-on-surface" : "text-on-surface";
  const iconTone =
    tone === "error"
      ? "bg-error-container/60 text-error"
      : "bg-surface-container text-secondary";

  return (
    <div className="bg-surface-container-lowest p-space-md rounded border border-outline-variant/60 shadow-sm flex items-start justify-between gap-2">
      <div className="flex flex-col min-w-0">
        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider">
          {label}
        </span>
        <div className="flex items-baseline gap-2 mt-1 flex-wrap">
          <span
            className={`font-headline-xl text-headline-xl font-bold leading-none ${valueTone}`}
          >
            {value}
          </span>
          {status ? (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-data-mono text-[10px] font-medium border ${status.className}`}
            >
              {status.icon ? (
                <Icon className={`text-[13px] ${status.pulse ? "animate-pulse" : ""}`}>
                  {status.icon}
                </Icon>
              ) : null}
              {status.text}
            </span>
          ) : unit ? (
            <span className="font-data-mono text-[11px] text-secondary font-medium">{unit}</span>
          ) : null}
        </div>
        {note ? (
          <span className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">{note}</span>
        ) : null}
      </div>
      <div className={`p-2 rounded ${iconTone}`}>
        <Icon className="text-[20px]">{icon}</Icon>
      </div>
    </div>
  );
}
