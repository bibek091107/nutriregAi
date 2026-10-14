"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button, Badge } from "@/components/ui/controls";
import { MetricCard, Panel, PanelHeader } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import {
  getDashboardSummary,
  getProducts,
  getRecentFindings,
} from "@/lib/api/products";
import { productStatusBadge, severityStyle, findingStatusBadge } from "@/lib/presentation";
import { formatDate, formatRelative, humanize, toPercent } from "@/lib/format";
import type { DashboardSummary, Finding, Product } from "@/lib/api/types";
import { MARKET_LABELS } from "@/lib/routes";
import { downloadCsv, stampedFileName } from "@/lib/export";

const ZERO_SUMMARY: DashboardSummary = {
  productCount: 0,
  activeAnalysisCount: 0,
  highRiskCount: 0,
  pendingReviewCount: 0,
  readiness: { ready: 0, reviewRequired: 0, missingInformation: 0 },
};

export default function DashboardPage() {
  const { reloadProducts } = useWorkspace();

  const summary = useResource<DashboardSummary>(
    (signal) => getDashboardSummary(signal),
    [],
    { isEmpty: () => false },
  );
  const products = useResource<Product[]>((signal) => getProducts(signal), []);
  const findings = useResource<Finding[]>((signal) => getRecentFindings(signal), []);

  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "open">("all");

  const stats = summary.data ?? ZERO_SUMMARY;
  const recentProducts = useMemo(() => (products.data ?? []).slice(0, 4), [products.data]);
  const recentFindings = useMemo(() => findings.data ?? [], [findings.data]);

  const highCount = recentFindings.filter((item) => item.severity === "HIGH").length;
  const openCount = recentFindings.filter((item) => item.status === "OPEN").length;

  const visibleFindings = useMemo(() => {
    if (severityFilter === "high") return recentFindings.filter((item) => item.severity === "HIGH");
    if (severityFilter === "open") return recentFindings.filter((item) => item.status === "OPEN");
    return recentFindings;
  }, [recentFindings, severityFilter]);

  const readinessTotal =
    stats.readiness.ready +
    stats.readiness.reviewRequired +
    stats.readiness.missingInformation;

  const reloadAll = useCallback(() => {
    summary.refetch();
    products.refetch();
    findings.refetch();
    reloadProducts();
  }, [summary, products, findings, reloadProducts]);

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-label-caps text-label-caps uppercase text-secondary tracking-wider bg-surface-container px-2 py-0.5 rounded">
              Compliance Engine v2.4
            </span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Monitor your products, regulatory analyses, risks, and pending reviews.
          </p>
        </div>
        <div className="flex items-center gap-space-sm flex-wrap">
          <Button
            variant="outline"
            icon="download"
            disabled={!summary.data}
            title={
              summary.data
                ? "Download the workspace overview and product register as CSV"
                : "The overview is unavailable because the API did not return a summary."
            }
            onClick={() => {
              const data = summary.data;
              if (!data) return;
              const register = (products.data ?? []).map((product) => ({
                product,
                high: product.risks.high,
                medium: product.risks.medium,
                low: product.risks.low,
              }));
              downloadCsv(stampedFileName("overview"), register, [
                { header: "Product", value: (row) => row.product.name },
                { header: "SKU", value: (row) => row.product.sku ?? "" },
                { header: "Status", value: (row) => humanize(row.product.status) },
                {
                  header: "Target market",
                  value: (row) =>
                    row.product.targetMarket
                      ? (MARKET_LABELS[row.product.targetMarket] ?? row.product.targetMarket)
                      : "",
                },
                { header: "Ingredients", value: (row) => row.product.ingredientCount },
                { header: "Claims", value: (row) => row.product.claimCount },
                { header: "Documents", value: (row) => row.product.documentCount },
                { header: "Findings", value: (row) => row.product.findingCount },
                { header: "High risk", value: (row) => row.high },
                { header: "Medium risk", value: (row) => row.medium },
                { header: "Low risk", value: (row) => row.low },
                {
                  header: "Ready",
                  value: (row) => data.readiness.ready,
                },
                {
                  header: "Review required",
                  value: (row) => data.readiness.reviewRequired,
                },
                {
                  header: "Missing information",
                  value: (row) => data.readiness.missingInformation,
                },
                { header: "Pending reviews", value: (row) => data.pendingReviewCount },
                { header: "Last analysis", value: (row) => formatDate(row.product.lastAnalysisAt) },
              ]);
            }}
          >
            Export Overview
          </Button>
          <Link href="/products/new">
            <Button variant="primary" icon="add">
              New Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric cards report real counts; a disconnected backend reads 0, never a demo figure. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-space-lg">
        <MetricCard
          label="Products"
          value={stats.productCount}
          unit={stats.productCount === 1 ? "Formulation" : "Formulations"}
          note={
            stats.activeAnalysisCount > 0
              ? `${stats.activeAnalysisCount} analysis run${stats.activeAnalysisCount === 1 ? "" : "s"} in progress`
              : "No active statutory runs"
          }
          icon="layers"
        />
        <MetricCard
          label="Active Analyses"
          value={stats.activeAnalysisCount}
          tone="active"
          status={
            stats.activeAnalysisCount > 0
              ? {
                  text: "Running",
                  className:
                    "bg-surface-container text-secondary border border-secondary/20 animate-none",
                  icon: "circle",
                  pulse: true,
                }
              : { text: "Idle", className: "bg-surface-container-low text-on-surface-variant border border-outline-variant/60" }
          }
          note={stats.activeAnalysisCount > 0 ? "Currently processing limits" : "No analysis running"}
          icon="sync"
        />
        <MetricCard
          label="High Risks"
          value={stats.highRiskCount}
          tone={stats.highRiskCount > 0 ? "error" : "neutral"}
          status={
            stats.highRiskCount > 0
              ? {
                  text: "Critical Action",
                  className: "bg-error-container text-error border border-error/20",
                }
              : { text: "None", className: "bg-surface-container-low text-on-surface-variant border border-outline-variant/60" }
          }
          note="Across all target markets"
          icon="warning"
        />
        <MetricCard
          label="Pending Reviews"
          value={stats.pendingReviewCount}
          unit={stats.pendingReviewCount === 1 ? "Dossier" : "Dossiers"}
          note="Require sign-off before filing"
          icon="fact_check"
        />
      </div>

      {summary.status === "error" ? (
        <div className="mb-space-lg">
          <ErrorState
            compact
            title="Unable to load dashboard summary"
            message={
              summary.error.userMessage +
              " Metrics are shown as zero until the backend responds."
            }
            onRetry={reloadAll}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
        <div className="xl:col-span-8 flex flex-col gap-space-lg">
          <Panel className="overflow-hidden">
            <div className="px-space-md py-3 border-b border-outline-variant/40 flex items-center justify-between bg-surface-container-low/40">
              <div className="flex items-center gap-2">
                <Icon className="text-secondary text-[20px]">inventory_2</Icon>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">
                  Recent Products
                </h2>
                <span className="font-data-mono text-data-mono text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                  {recentProducts.length} active shown
                </span>
              </div>
              <Link
                href="/products"
                className="font-label-md text-label-md text-secondary hover:text-secondary-container font-medium flex items-center gap-1 group"
              >
                <span>View All</span>
                <Icon className="text-[16px] group-hover:translate-x-0.5 transition-transform">
                  arrow_forward
                </Icon>
              </Link>
            </div>

            {products.status === "loading" ? (
              <div className="p-space-md">
                <LoadingState label="Loading products..." rows={4} />
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
            ) : recentProducts.length === 0 ? (
              <div className="p-space-md">
                <EmptyState
                  compact
                  icon="inventory_2"
                  title="No products yet"
                  description="Create your first product or ingest an existing formulation dossier to start real-time cross-jurisdictional compliance screening."
                  action={
                    <Link href="/products/new">
                      <Button variant="primary" size="lg" icon="add">
                        Create Product
                      </Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/80 border-b border-outline-variant/50 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
                      <th className="py-2.5 px-space-md font-semibold">Product &amp; Code</th>
                      <th className="py-2.5 px-space-sm font-semibold">Category</th>
                      <th className="py-2.5 px-space-sm font-semibold">Target Market</th>
                      <th className="py-2.5 px-space-sm font-semibold">Regulatory Status</th>
                      <th className="py-2.5 px-space-sm font-semibold text-center">Statutory Risks</th>
                      <th className="py-2.5 px-space-sm font-semibold">Last Analysis</th>
                      <th className="py-2.5 px-space-md font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm text-on-surface">
                    {recentProducts.map((product) => {
                      const status = productStatusBadge(product.status);
                      return (
                        <tr
                          key={product.id}
                          className="hover:bg-surface-container-low/50 transition-colors"
                        >
                          <td className="py-3 px-space-md">
                            <div className="flex flex-col">
                              <span className="font-label-md text-label-md font-semibold text-on-surface">
                                {product.name}
                              </span>
                              <span className="font-data-mono text-[11px] text-on-surface-variant">
                                {product.sku ?? "No SKU"}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-space-sm text-on-surface-variant">
                            {humanize(product.category)}
                          </td>
                          <td className="py-3 px-space-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-secondary" />
                              <span className="font-medium text-on-surface">
                                {MARKET_LABELS[product.targetMarket ?? "OTHER"]}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-space-sm">
                            <Badge tone={status.tone} icon={status.icon}>
                              {humanize(product.status)}
                            </Badge>
                          </td>
                          <td className="py-3 px-space-sm text-center">
                            {product.risks.high > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-error-container text-error border border-error/30 font-data-mono text-[11px] font-bold">
                                {product.risks.high} High
                              </span>
                            ) : product.risks.medium > 0 ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-data-mono text-[11px] font-medium">
                                {product.risks.medium} Medium
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/60 font-data-mono text-[11px]">
                                0 High
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-space-sm font-data-mono text-[11px] text-on-surface-variant">
                            {formatDate(product.lastAnalysisAt)}
                          </td>
                          <td className="py-3 px-space-md text-right">
                            <Link href={`/products/${product.id}`}>
                              <Button
                                size="sm"
                                variant={product.status === "COMPLETED" ? "outline" : "primary"}
                              >
                                {product.status === "COMPLETED" ? "View" : "Open"}
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
          </Panel>

          <Panel className="p-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-outline-variant/40 gap-2 mb-space-md">
              <div className="flex items-center gap-2">
                <Icon className="text-error text-[20px]">assignment_late</Icon>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">
                  Recent Regulatory Findings
                </h2>
              </div>
              <div className="flex items-center gap-1 p-0.5 rounded bg-surface-container-low border border-outline-variant/40">
                {(
                  [
                    { key: "all", label: `All (${recentFindings.length})` },
                    { key: "high", label: `High Severity (${highCount})` },
                    { key: "open", label: `Open Actions (${openCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSeverityFilter(tab.key)}
                    aria-pressed={severityFilter === tab.key}
                    className={`px-2.5 py-1 rounded text-label-sm font-label-sm transition-colors ${
                      severityFilter === tab.key
                        ? "bg-surface-container-lowest text-on-surface font-semibold shadow-xs"
                        : "text-on-surface-variant hover:text-on-surface font-medium"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {findings.status === "loading" ? (
              <LoadingState label="Loading findings..." rows={3} />
            ) : findings.status === "error" ? (
              <ErrorState
                compact
                title="Unable to load regulatory findings"
                message={findings.error.userMessage}
                onRetry={findings.refetch}
              />
            ) : visibleFindings.length === 0 ? (
              <EmptyState
                compact
                icon="assignment_late"
                title="No regulatory findings"
                description="Findings appear here after a statutory analysis run. Run an analysis on a product to surface regulatory risks."
                action={
                  <Link href="/products">
                    <Button variant="primary" icon="inventory_2">
                      Go to Products
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-space-sm">
                {visibleFindings.map((finding) => {
                  const severity = severityStyle(finding.severity);
                  const status = findingStatusBadge(finding.status);
                  return (
                    <article
                      key={finding.id}
                      className="p-space-sm rounded border border-outline-variant/50 hover:border-outline-variant transition-colors bg-surface-container-lowest flex flex-col md:flex-row md:items-center justify-between gap-space-sm"
                    >
                      <div className="flex items-start gap-space-sm min-w-0">
                        <span
                          className={`shrink-0 font-label-caps text-label-caps px-2 py-0.5 rounded font-bold uppercase tracking-wider border mt-0.5 ${severity.className}`}
                        >
                          {finding.severity}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-label-md text-label-md font-semibold text-on-surface">
                              {finding.productName}
                            </span>
                            {finding.statutoryReference ? (
                              <span className="font-data-mono text-[10px] text-on-surface-variant bg-surface-container-low px-1.5 py-0.2 rounded border border-outline-variant/40">
                                {finding.statutoryReference}
                              </span>
                            ) : null}
                          </div>
                          <p className="font-body-md text-body-md text-on-surface font-medium mt-0.5 leading-snug">
                            {finding.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1 font-body-sm text-body-sm text-on-surface-variant">
                            <span className="flex items-center gap-1 font-medium">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${status.dot}`}
                              />
                              Status: {humanize(finding.status)}
                            </span>
                            <span>•</span>
                            <span>Detected {formatRelative(finding.detectedAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 self-end md:self-center">
                        <Link href={`/readiness?product=${finding.productId}`}>
                          <Button size="sm" variant="outline">
                            View Finding
                          </Button>
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="xl:col-span-4 flex flex-col gap-space-lg">
          <Panel className="p-space-md">
            <PanelHeader
              icon="bolt"
              title="Quick Actions"
              trailing={
                <span className="font-data-mono text-[11px] text-on-surface-variant uppercase">
                  Operator Tools
                </span>
              }
            />
            <div className="space-y-1">
              {[
                {
                  href: "/products/new",
                  icon: "add_box",
                  iconClass: "bg-secondary/10 text-secondary",
                  title: "New Product",
                  subtitle: "Start product intake & formulations",
                },
                {
                  href: "/documents",
                  icon: "upload_file",
                  iconClass: "bg-surface-container text-on-surface",
                  title: "Upload Regulatory Document",
                  subtitle: "Specs, CoA, Dossier PDF",
                },
                {
                  href: "/products",
                  icon: "batch_prediction",
                  iconClass: "bg-surface-container text-on-surface",
                  title: "Batch Statutory Analysis",
                  subtitle: "Run the statutory engine",
                },
                {
                  href: "/reviews",
                  icon: "rule",
                  iconClass: "bg-surface-container text-on-surface",
                  title: "Open Review Queue",
                  subtitle: "Findings awaiting technical review",
                  badge: stats.pendingReviewCount > 0,
                },
              ].map((action) => (
                <Link
                  key={action.title}
                  href={action.href}
                  className="w-full flex items-center justify-between p-2 rounded hover:bg-surface-container-low transition-colors group text-left border border-transparent hover:border-outline-variant/40"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${action.iconClass}`}
                    >
                      <Icon className="text-[18px]">{action.icon}</Icon>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="font-label-md text-label-md text-on-surface font-medium group-hover:text-secondary truncate">
                          {action.title}
                        </span>
                        {action.badge ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                        ) : null}
                      </span>
                      <span className="font-body-sm text-[11px] text-on-surface-variant truncate">
                        {action.subtitle}
                      </span>
                    </div>
                  </div>
                  <Icon className="text-[18px] text-outline group-hover:text-secondary group-hover:translate-x-0.5 transition-all">
                    chevron_right
                  </Icon>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="p-space-md">
            <PanelHeader
              icon="verified"
              title="Regulatory Readiness"
              trailing={
                <span className="font-data-mono text-[11px] text-secondary font-medium">
                  {readinessTotal} SKU{readinessTotal === 1 ? "" : "s"} Tracked
                </span>
              }
            />
            {readinessTotal === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">
                No tracked products. Readiness is calculated once a product exists and an analysis
                has run.
              </p>
            ) : (
              <>
                <div className="w-full h-2.5 rounded-full bg-surface-container flex overflow-hidden mb-space-md">
                  <div
                    className="bg-emerald-600 h-full"
                    style={{ width: `${toPercent(stats.readiness.ready, readinessTotal)}%` }}
                    title={`${stats.readiness.ready} Ready`}
                  />
                  <div
                    className="bg-amber-500 h-full"
                    style={{
                      width: `${toPercent(stats.readiness.reviewRequired, readinessTotal)}%`,
                    }}
                    title={`${stats.readiness.reviewRequired} Review Required`}
                  />
                  <div
                    className="bg-error h-full"
                    style={{
                      width: `${toPercent(stats.readiness.missingInformation, readinessTotal)}%`,
                    }}
                    title={`${stats.readiness.missingInformation} Missing Information`}
                  />
                </div>
                <div className="space-y-2.5">
                  {[
                    { label: "Ready for submission", value: stats.readiness.ready, swatch: "bg-emerald-600" },
                    { label: "Requiring review", value: stats.readiness.reviewRequired, swatch: "bg-amber-500" },
                    {
                      label: "Missing statutory data",
                      value: stats.readiness.missingInformation,
                      swatch: "bg-error",
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between font-body-sm text-body-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-sm ${row.swatch}`} />
                        <span className="text-on-surface font-medium">{row.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-data-mono font-semibold text-on-surface">
                          {row.value}
                        </span>
                        <span className="font-data-mono text-[11px] text-on-surface-variant">
                          ({toPercent(row.value, readinessTotal)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel className="p-space-md">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    summary.status === "success" ? "bg-emerald-500" : "bg-outline"
                  }`}
                />
                <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider font-semibold">
                  Statutory Engine Sync
                </span>
              </div>
              <span className="font-data-mono text-[11px] text-secondary">
                {summary.status === "success" ? "Connected" : "Not connected"}
              </span>
            </div>
            {summary.status === "loading" ? (
              <LoadingState label="Connecting to the statutory engine..." rows={2} />
            ) : summary.status === "error" ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                The statutory engine is not reachable. {summary.error.userMessage}
              </p>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Engine version, gazette baseline, and last poll are reported by the backend once the
                regulatory knowledge base is connected.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
