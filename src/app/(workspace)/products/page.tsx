"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button, Badge } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { NewProductModal } from "@/components/products/NewProductModal";
import { StageProgress, WorkflowStepper } from "@/components/products/WorkflowStepper";
import { useResource } from "@/lib/hooks/useResource";
import { getProducts } from "@/lib/api/products";
import { productStatusBadge } from "@/lib/presentation";
import { formatDate, humanize, toPercent } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/routes";
import { downloadCsv, stampedFileName } from "@/lib/export";
import type { Product, ProductStatus } from "@/lib/api/types";

type StatusFilter = "ALL" | ProductStatus;

/** Action label shown per product, derived only from backend state. */
function actionFor(product: Product): { label: string; variant: "primary" | "outline" | "solid" } {
  switch (product.status) {
    case "COMPLETED":
      return { label: "View", variant: "outline" };
    case "IN_PROGRESS":
    case "REVIEW_REQUIRED":
    case "NEEDS_ATTENTION":
      return { label: "Continue", variant: "outline" };
    case "DRAFT":
    case "NOT_STARTED":
      return { label: "Start", variant: "solid" };
    default:
      return { label: "Open", variant: "primary" };
  }
}

export default function ProductsPage() {
  const products = useResource<Product[]>((signal) => getProducts(signal), []);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [marketFilter, setMarketFilter] = useState<string>("ALL");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: all.length };
    for (const product of all) {
      counts[product.status] = (counts[product.status] ?? 0) + 1;
    }
    return counts;
  }, [all]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((product) => {
      if (statusFilter !== "ALL" && product.status !== statusFilter) return false;
      if (marketFilter !== "ALL" && (product.targetMarket ?? "OTHER") !== marketFilter) return false;
      if (riskFilter === "HIGH" && product.risks.high === 0) return false;
      if (riskFilter === "MEDIUM" && product.risks.medium === 0) return false;
      if (riskFilter === "NONE" && product.risks.high + product.risks.medium > 0) return false;
      if (!term) return true;
      return (
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term) ||
        (product.category ?? "").toLowerCase().includes(term)
      );
    });
  }, [all, search, statusFilter, marketFilter, riskFilter]);

  const selected = useMemo(
    () => visible.find((product) => product.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const totalHigh = all.reduce((sum, product) => sum + product.risks.high, 0);
  const totalMedium = all.reduce((sum, product) => sum + product.risks.medium, 0);
  const missingData = all.filter(
    (product) => product.documentCount === 0 || product.ingredientCount === 0,
  ).length;

  const filterPills: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: `All (${statusCounts.ALL ?? 0})` },
    { key: "IN_PROGRESS", label: `In Progress (${statusCounts.IN_PROGRESS ?? 0})` },
    { key: "REVIEW_REQUIRED", label: `Review Required (${statusCounts.REVIEW_REQUIRED ?? 0})` },
    { key: "COMPLETED", label: `Completed (${statusCounts.COMPLETED ?? 0})` },
    { key: "NEEDS_ATTENTION", label: `Needs Attention (${statusCounts.NEEDS_ATTENTION ?? 0})` },
  ];

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-space-md mb-space-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs mb-0.5">
              <span className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
                Products &amp; Workflows
              </span>
              <span className="font-data-mono text-[11px] text-secondary bg-surface-container-high px-2 py-0.5 rounded font-medium">
                {all.length} ACTIVE DOSSIER{all.length === 1 ? "" : "S"}
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Manage your enterprise formulary and track cross-jurisdictional compliance milestones
              in real time.
            </p>
          </div>
          <div className="flex items-center gap-space-sm self-start lg:self-auto shrink-0">
            <Button
              variant="outline"
              icon="file_download"
              disabled={visible.length === 0}
              title={
                visible.length === 0
                  ? "No products match the current filters, so there is nothing to export."
                  : `Download the ${visible.length} filtered products as CSV`
              }
              onClick={() =>
                downloadCsv(
                  stampedFileName("products"),
                  visible,
                  [
                    { header: "Product", value: (product) => product.name },
                    { header: "SKU", value: (product) => product.sku ?? "" },
                    { header: "Status", value: (product) => humanize(product.status) },
                    { header: "Category", value: (product) => humanize(product.category) },
                    {
                      header: "Target market",
                      value: (product) =>
                        product.targetMarket
                          ? (MARKET_LABELS[product.targetMarket] ?? product.targetMarket)
                          : "",
                    },
                    { header: "Ingredients", value: (product) => product.ingredientCount },
                    { header: "Claims", value: (product) => product.claimCount },
                    { header: "Documents", value: (product) => product.documentCount },
                    { header: "Findings", value: (product) => product.findingCount },
                    { header: "High risk", value: (product) => product.risks.high },
                    { header: "Medium risk", value: (product) => product.risks.medium },
                    { header: "Low risk", value: (product) => product.risks.low },
                    { header: "Last analysis", value: (product) => formatDate(product.lastAnalysisAt) },
                    { header: "Product ID", value: (product) => product.id },
                  ],
                )
              }
            >
              Export List
            </Button>
            <Button variant="primary" icon="add" onClick={() => setModalOpen(true)}>
              + New Product
            </Button>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-space-sm bg-surface-container-lowest p-2 rounded shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <div className="relative w-full sm:w-80">
              <label htmlFor="product-search" className="sr-only">
                Search products
              </label>
              <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[17px]">
                search
              </Icon>
              <input
                id="product-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none transition-all"
                placeholder="Search products by name, category, or market..."
              />
            </div>
            <div className="hidden sm:block h-5 w-[1px] bg-surface-container mx-1" />
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {filterPills.map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  aria-pressed={statusFilter === pill.key}
                  className={`h-7 px-2.5 rounded font-label-sm text-label-sm font-medium shrink-0 transition-colors ${
                    statusFilter === pill.key
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end xl:self-auto shrink-0">
            <label htmlFor="market-filter" className="sr-only">
              Filter by market
            </label>
            <select
              id="market-filter"
              value={marketFilter}
              onChange={(event) => setMarketFilter(event.target.value)}
              className="h-7 pl-2 pr-6 rounded bg-surface-container-low text-body-sm font-body-sm text-on-surface appearance-none focus:outline-none focus:border-secondary border border-outline-variant/40"
            >
              <option value="ALL">Market: All Markets</option>
              {Object.entries(MARKET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  Market: {label}
                </option>
              ))}
            </select>
            <label htmlFor="risk-filter" className="sr-only">
              Filter by risk
            </label>
            <select
              id="risk-filter"
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              className="h-7 pl-2 pr-6 rounded bg-surface-container-low text-body-sm font-body-sm text-on-surface appearance-none focus:outline-none focus:border-secondary border border-outline-variant/40"
            >
              <option value="ALL">Risk: All Levels</option>
              <option value="HIGH">Risk: High Only</option>
              <option value="MEDIUM">Risk: Medium Only</option>
              <option value="NONE">Risk: None Flagged</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-7 xl:col-span-7 flex flex-col bg-surface-container-lowest rounded shadow-sm overflow-hidden">
          <div className="px-space-md py-space-sm bg-surface-container-low/40 flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="font-headline-sm text-headline-sm text-on-surface">
                Formulations Ledger
              </span>
              <span className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider bg-surface-container px-1.5 py-0.5 rounded">
                Real-time Feed
              </span>
            </div>
            <span className="font-data-mono text-data-mono text-on-surface-variant">
              {all.length > 0 ? `${visible.length} of ${all.length} shown` : "No records"}
            </span>
          </div>

          {products.status === "loading" ? (
            <div className="p-space-md">
              <LoadingState label="Loading products..." rows={5} />
            </div>
          ) : products.status === "error" ? (
            <div className="p-space-md">
              <ErrorState
                compact
                title="Unable to load products"
                message={products.error.userMessage}
                onRetry={products.refetch}
              />
            </div>
          ) : all.length === 0 ? (
            <div className="p-space-md">
              <EmptyState
                compact
                icon="inventory_2"
                title="No products yet"
                description="Create a product to start a regulatory workflow."
                action={
                  <Button variant="primary" icon="add" onClick={() => setModalOpen(true)}>
                    + New Product
                  </Button>
                }
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-space-md">
              <EmptyState
                compact
                icon="filter_alt_off"
                title="No matching products"
                description="No products match the current search and filters. Adjust the filters to see more."
                action={
                  <Button
                    variant="outline"
                    icon="restart_alt"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("ALL");
                      setMarketFilter("ALL");
                      setRiskFilter("ALL");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-semibold">Product &amp; SKU</th>
                    <th className="py-2.5 px-3 font-semibold">Category</th>
                    <th className="py-2.5 px-3 font-semibold">Market</th>
                    <th className="py-2.5 px-3 font-semibold">Workflow Stage</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Risks</th>
                    <th className="py-2.5 px-3 font-semibold">Last Audit</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low text-body-sm font-body-sm">
                  {visible.map((product) => {
                    const status = productStatusBadge(product.status);
                    const action = actionFor(product);
                    const isSelected = selected?.id === product.id;
                    return (
                      <tr
                        key={product.id}
                        onClick={() => setSelectedId(product.id)}
                        className={`cursor-pointer transition-colors group ${
                          isSelected ? "bg-surface-container-high/60" : "hover:bg-surface-container-low/60"
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                product.status === "COMPLETED"
                                  ? "bg-on-tertiary-container"
                                  : product.status === "NOT_STARTED" || product.status === "DRAFT"
                                    ? "bg-transparent"
                                    : "bg-secondary"
                              }`}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-on-surface group-hover:text-secondary truncate">
                                {product.name}
                              </span>
                              <span className="font-data-mono text-[11px] text-on-surface-variant">
                                {product.sku ?? "No SKU"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-on-surface-variant whitespace-nowrap">
                          {humanize(product.category)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-on-surface bg-surface-container px-1.5 py-0.5 rounded">
                            {MARKET_LABELS[product.targetMarket ?? "OTHER"]}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[140px]">
                          <StageProgress stages={product.stages} />
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge tone={status.tone} icon={status.icon}>
                            {humanize(product.status)}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {product.risks.high > 0 ? (
                            <span className="font-data-mono text-[11px] font-semibold text-error bg-error-container/60 px-1.5 py-0.5 rounded">
                              {product.risks.high} High
                            </span>
                          ) : product.risks.medium > 0 ? (
                            <span className="font-data-mono text-[11px] font-semibold text-secondary-container bg-surface-container-high px-1.5 py-0.5 rounded">
                              {product.risks.medium} Medium
                            </span>
                          ) : (
                            <span className="font-data-mono text-[11px] text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
                              0 Risks
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-data-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                          {formatDate(product.lastAnalysisAt)}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <Link href={`/products/${product.id}`} onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant={action.variant}>
                              {action.label}
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-space-md">
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-md flex flex-col gap-space-md">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-space-sm pb-space-sm border-b border-surface-container-low">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                        {selected.name}
                      </span>
                      <span className="font-data-mono text-[11px] text-on-surface-variant bg-surface-container-low px-1.5 py-0.5 rounded">
                        {selected.sku ?? "No SKU"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-on-surface-variant text-[12px]">
                      <Icon className="text-[14px] text-secondary">location_on</Icon>
                      <span>
                        Target:{" "}
                        <strong className="text-on-surface font-medium">
                          {MARKET_LABELS[selected.targetMarket ?? "OTHER"]}
                        </strong>
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const status = productStatusBadge(selected.status);
                    return (
                      <Badge tone={status.tone} dot dotClassName="bg-current" className="shrink-0">
                        {humanize(selected.status)}
                      </Badge>
                    );
                  })()}
                </div>

                <WorkflowStepper stages={selected.stages} />

                <div className="flex flex-col gap-2 pt-space-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                      Analysis Health Summary
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
                      {selected.risks.high + selected.risks.medium > 0
                        ? "Action Required"
                        : "No Action Required"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-container-low p-2 rounded flex flex-col">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
                        Risks
                      </span>
                      <span className="font-headline-sm text-[15px] font-bold text-on-surface mt-0.5">
                        {selected.risks.high} High
                      </span>
                      <span className="font-data-mono text-[10px] text-on-surface-variant">
                        {selected.risks.medium} Medium
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-2 rounded flex flex-col">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
                        Missing Data
                      </span>
                      <span className="font-headline-sm text-[15px] font-bold text-on-surface mt-0.5">
                        {missingData} Item{missingData === 1 ? "" : "s"}
                      </span>
                      <span className="font-data-mono text-[10px] text-on-surface-variant truncate">
                        {selected.documentCount === 0 ? "No documents" : "Docs present"}
                      </span>
                    </div>
                    <div className="bg-surface-container-low p-2 rounded flex flex-col">
                      <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
                        Claims
                      </span>
                      <span className="font-headline-sm text-[15px] font-bold text-secondary mt-0.5">
                        {selected.claimCount}
                      </span>
                      <span className="font-data-mono text-[10px] text-on-surface-variant truncate">
                        {selected.ingredientCount} ingredients
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-high/70 p-space-md rounded flex flex-col gap-space-sm">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={`text-[16px] ${selected.risks.high > 0 ? "text-error" : "text-secondary"}`}
                    >
                      {selected.risks.high > 0 ? "warning" : "check_circle"}
                    </Icon>
                    <span className="font-label-caps text-label-caps text-on-surface font-bold uppercase tracking-wider">
                      Next Action
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <p className="font-body-sm text-body-sm font-medium text-on-surface">
                      {selected.risks.high > 0
                        ? `Review ${selected.risks.high} high-risk finding${
                            selected.risks.high === 1 ? "" : "s"
                          }.`
                        : selected.documentCount === 0
                          ? "Upload product documents to complete the dossier."
                          : "Run a statutory analysis to surface regulatory findings."}
                    </p>
                    <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                      {selected.findingCount} finding{selected.findingCount === 1 ? "" : "s"} recorded
                      from the last analysis run.
                    </p>
                  </div>
                  <div className="flex items-center gap-space-sm pt-1">
                    <Link href={`/products/${selected.id}`} className="flex-1">
                      <Button variant="primary" className="w-full">
                        Continue Review
                        <Icon className="text-[16px]">arrow_forward</Icon>
                      </Button>
                    </Link>
                    <Link href={`/readiness?product=${selected.id}`}>
                      <Button variant="outline" className="shrink-0" title="Inspect readiness">
                        <Icon className="text-[17px] text-secondary">visibility</Icon>
                      </Button>
                    </Link>
                  </div>
                </div>
              </>
            ) : products.status === "loading" ? (
              <LoadingState label="Loading workflow..." rows={4} />
            ) : (
              <EmptyState
                compact
                icon="account_tree"
                title="No product selected"
                description="Select a product from the ledger to view its regulatory workflow."
              />
            )}
          </div>

          {all.length > 0 ? (
            <div className="bg-surface-container-lowest p-space-md rounded shadow-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center shrink-0">
                  <Icon className="text-[18px] text-secondary">auto_stories</Icon>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-label-md text-label-md text-on-surface font-medium truncate leading-tight">
                    Statutory Ruleset
                  </span>
                  <span className="font-data-mono text-[11px] text-on-surface-variant truncate">
                    {all.length} dossier{all.length === 1 ? "" : "s"} · {totalHigh} high /{" "}
                    {totalMedium} medium risk
                  </span>
                </div>
              </div>
              <Link href="/sources" className="shrink-0">
                <Button size="sm" variant="outline" icon="tune">
                  Change
                </Button>
              </Link>
            </div>
          ) : null}

          {all.length > 0 ? (
            <p className="font-label-sm text-label-sm text-on-surface-variant px-1">
              {toPercent(
                all.filter((product) => product.status === "COMPLETED").length,
                all.length,
              )}
              % of dossiers are workflow-complete.
            </p>
          ) : null}
        </div>
      </div>

      <NewProductModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
