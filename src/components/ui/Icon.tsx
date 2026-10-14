import type { ReactNode } from "react";

/** Renders a Material Symbols ligature, matching the approved icon set. */
export function Icon({
  children,
  className = "",
  filled = false,
}: {
  children: ReactNode;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: '"FILL" 1' } : undefined}
    >
      {children}
    </span>
  );
}
