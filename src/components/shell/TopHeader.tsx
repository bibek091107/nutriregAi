"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSession } from "@/lib/auth/session";

export interface HeaderContext {
  breadcrumbs: { label: string; href?: string }[];
  targetMarket?: string | null;
  alertCount?: number;
  onNewProduct?: () => void;
}

/**
 * Top bar ported from the approved shell: breadcrumb hierarchy, jurisdiction
 * chip, global search, alerts, primary action, avatar.
 */
export function TopHeader({
  breadcrumbs,
  targetMarket,
  alertCount = 0,
  onNewProduct,
}: HeaderContext) {
  const router = useRouter();
  const { user } = useSession();
  const [query, setQuery] = useState("");
  const [alertsOpen, setAlertsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("global-regulatory-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/sources?search=${encodeURIComponent(trimmed)}`);
  };

  return (
    <header className="fixed top-0 left-60 right-0 h-14 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/40 z-40 px-space-lg flex items-center justify-between">
      <div className="flex items-center gap-space-md min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-on-surface-variant font-label-md text-label-md"
        >
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <Icon className="text-[14px]">chevron_right</Icon> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-on-surface truncate">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-on-surface font-semibold truncate">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        {targetMarket ? (
          <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded border border-outline-variant/60 bg-surface-container-low text-on-surface">
            <Icon className="text-[14px] text-secondary">public</Icon>
            <span className="font-data-mono text-data-mono font-medium">{targetMarket}</span>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-space-md">
        <form onSubmit={submitSearch} className="relative w-80 lg:w-96" role="search">
          <label htmlFor="global-regulatory-search" className="sr-only">
            Search regulations, ingredients, and statutory rules
          </label>
          <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </Icon>
          <input
            id="global-regulatory-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface border border-outline-variant/60 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary text-on-surface placeholder:text-on-surface-variant/70"
            placeholder="Search regulations, ingredients, FSSAI rules... (Cmd+K)"
            type="search"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 font-data-mono text-[10px] text-on-surface-variant bg-surface-container px-1 rounded border border-outline-variant/40">
            ⌘K
          </span>
        </form>

        <div className="flex items-center gap-space-sm">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAlertsOpen((open) => !open)}
              aria-label={`Regulatory alerts${alertCount ? `, ${alertCount} unread` : ""}`}
              aria-expanded={alertsOpen}
              className="relative p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <Icon className="text-[20px]">notifications</Icon>
              {alertCount > 0 ? (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error ring-2 ring-surface-container-lowest" />
              ) : null}
            </button>
            {alertsOpen ? (
              <div className="absolute right-0 top-full mt-1 w-72 bg-surface-container-lowest border border-outline-variant/60 rounded shadow-lg p-3 z-50">
                <p className="font-label-md text-label-md text-on-surface font-medium mb-1">
                  Regulatory alerts
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {alertCount > 0
                    ? `${alertCount} alert${alertCount === 1 ? "" : "s"} awaiting attention.`
                    : "No alerts. Connect the backend to receive live regulatory alerts."}
                </p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onNewProduct ?? (() => router.push("/products/new"))}
            className="h-8 px-space-md bg-secondary hover:bg-secondary-container text-on-secondary rounded font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Icon className="text-[16px]">add</Icon>
            <span>New Product</span>
          </button>

          <Link
            href="/settings"
            aria-label={user ? "Your profile" : "Not signed in"}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
          >
            <Icon className="text-on-primary text-[18px]">
              {user ? "account_circle" : "person"}
            </Icon>
          </Link>
        </div>
      </div>
    </header>
  );
}
