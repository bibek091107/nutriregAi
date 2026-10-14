"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { initialsFor, useSession } from "@/lib/auth/session";
import type { Product } from "@/lib/api/types";

/**
 * Nav routes. Each entry maps to a real page; the icons and labels are copied
 * verbatim from the approved sidebar.
 */
const NAV_ITEMS: { path: string; label: string; icon: string }[] = [
  { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { path: "/products", label: "Products & Workflows", icon: "inventory_2" },
  { path: "/ingredients", label: "Ingredients", icon: "science" },
  { path: "/claims", label: "Claims Matrix", icon: "verified" },
  { path: "/documents", label: "Document Vault", icon: "description" },
  { path: "/readiness", label: "Regulatory Readiness", icon: "gshield" },
  { path: "/evidence", label: "Evidence Viewer", icon: "policy" },
  { path: "/reviews", label: "Review Queue", icon: "fact_check" },
  { path: "/sources", label: "Statutory Sources", icon: "menu_book" },
  { path: "/reports", label: "Audit Reports", icon: "assessment" },
  { path: "/settings", label: "Settings", icon: "settings" },
];

const MARKET_LABELS: Record<string, string> = {
  INDIA_FSSAI: "India (FSSAI 2026)",
  USA_FDA: "USA (FDA / DSHEA)",
  EU_EFSA: "EU (EFSA 1169)",
  UAE_MOIAT: "UAE (MoIAT / Halal)",
  OTHER: "Other jurisdiction",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  REVIEW_REQUIRED: "Review required",
  NEEDS_ATTENTION: "Needs attention",
  COMPLETED: "Completed",
};

export function Sidebar({
  products,
  activeProductId,
}: {
  products: Product[];
  activeProductId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status, signOut } = useSession();
  const [pickerOpen, setPickerOpen] = useState(false);

  const active =
    products.find((product) => product.id === activeProductId) ?? products[0] ?? null;

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-surface-container-lowest border-r border-outline-variant/40 z-50 flex flex-col justify-between select-none">
      <div className="flex flex-col min-h-0">
        <div className="h-14 px-space-md flex items-center justify-between border-b border-outline-variant/30">
          <Link href="/dashboard" className="flex items-center gap-space-sm min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-7 w-auto object-contain" />
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-headline-sm tracking-tight text-on-surface truncate leading-none">
                NutriReg AI
              </span>
              <span className="font-label-caps text-label-caps text-on-surface-variant leading-tight">
                Enterprise Hub
              </span>
            </div>
          </Link>
          <span className="font-data-mono text-data-mono bg-surface-container-low px-1.5 py-0.5 rounded text-on-surface-variant border border-outline-variant/40">
            v2.4
          </span>
        </div>

        <div className="p-space-sm border-b border-outline-variant/30 bg-surface-container-low/50 relative">
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-expanded={pickerOpen}
            aria-haspopup="listbox"
            className="w-full flex items-center justify-between px-space-sm py-1.5 rounded bg-surface-container-lowest border border-outline-variant/60 hover:border-secondary transition-colors text-left group"
          >
            <div className="flex flex-col min-w-0 pr-space-xs">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                Active Product
              </span>
              {active ? (
                <>
                  <span className="font-body-sm text-body-sm font-medium text-on-surface truncate">
                    {active.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-secondary truncate">
                    {MARKET_LABELS[active.targetMarket ?? "OTHER"]}
                  </span>
                </>
              ) : (
                <>
                  <span className="font-body-sm text-body-sm font-medium text-on-surface truncate">
                    No product selected
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                    {products.length === 0
                      ? "Create a product to begin"
                      : "Select a product"}
                  </span>
                </>
              )}
            </div>
            <Icon className="text-[18px] text-on-surface-variant group-hover:text-secondary shrink-0">
              unfold_more
            </Icon>
          </button>

          {pickerOpen ? (
            <div
              role="listbox"
              aria-label="Active product"
              className="absolute left-space-sm right-space-sm top-full mt-1 z-50 bg-surface-container-lowest border border-outline-variant/60 rounded shadow-lg max-h-64 overflow-y-auto"
            >
              {products.length === 0 ? (
                <p className="p-3 font-body-sm text-body-sm text-on-surface-variant">
                  No products yet.
                </p>
              ) : (
                products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    role="option"
                    aria-selected={product.id === active?.id}
                    onClick={() => {
                      setPickerOpen(false);
                      router.push(`/products/${product.id}`);
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-surface-container transition-colors border-b border-outline-variant/20 last:border-b-0 ${
                      product.id === active?.id ? "bg-surface-container-high/60" : ""
                    }`}
                  >
                    <span className="block font-label-md text-label-md text-on-surface truncate">
                      {product.name}
                    </span>
                    <span className="block font-data-mono text-[11px] text-on-surface-variant truncate">
                      {product.sku ?? "No SKU"} · {STATUS_LABELS[product.status] ?? product.status}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-space-sm py-space-sm">
          <div className="px-space-sm py-1 font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
            Workspace Modules
          </div>
          <nav className="space-y-0.5 mt-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive(item.path) ? "page" : undefined}
                className={`flex items-center gap-space-sm px-space-sm py-1.5 rounded text-body-sm font-body-sm transition-all ${
                  isActive(item.path)
                    ? "bg-surface-container-high text-secondary font-medium border-l-2 border-secondary"
                    : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                }`}
              >
                <Icon className="text-[18px] shrink-0">{item.icon}</Icon>
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="p-space-sm border-t border-outline-variant/30 bg-surface-container-low/40">
        {status === "authenticated" && user ? (
          <div className="flex items-center justify-between p-1.5 rounded bg-surface-container-lowest border border-outline-variant/40">
            <div className="flex items-center gap-space-xs min-w-0">
              <div className="relative">
                <div className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-headline-sm text-xs font-semibold">
                  {initialsFor(user.displayName)}
                </div>
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-secondary ring-1 ring-surface-container-lowest" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-on-surface font-medium truncate leading-tight">
                  {user.displayName}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  {user.organizationName ?? "—"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
              className="p-1 text-on-surface-variant hover:text-error hover:bg-error-container/30 rounded transition-colors"
            >
              <Icon className="text-[18px]">logout</Icon>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-surface-container-lowest border border-outline-variant/40">
            <div className="flex items-center gap-space-xs min-w-0">
              <div className="w-7 h-7 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
                <Icon className="text-[16px]">person</Icon>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-on-surface font-medium truncate leading-tight">
                  Not signed in
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  Auth not connected
                </span>
              </div>
            </div>
            <Link
              href="/settings"
              aria-label="Account settings"
              className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded transition-colors"
            >
              <Icon className="text-[18px]">manage_accounts</Icon>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
