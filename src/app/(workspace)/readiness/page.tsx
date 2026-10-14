"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState, ProcessingState } from "@/components/ui/states";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import {
  getAnalysisStatus,
  getComplianceItems,
  getProduct,
  getProductDocuments,
  getProductFindings,
  startAnalysis,
} from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import { documentStatusBadge, findingStatusBadge, severityStyle } from "@/lib/presentation";
import { formatDate, humanize, toPercent } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/routes";
import type { ComplianceItem, Finding, FindingSeverity, Product } from "@/lib/api/types";

type FindingFilter = "ALL" | "HIGH" | "CATEGORY";

/**
 * Regulatory Readiness: product-scoped audit view. Every number below is
 * derived from backend responses; nothing is inferred locally.
 */
export default function ReadinessPage() {
  const { products, reloadProducts } = useWorkspace();
  const [productId, setProductId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FindingFilter>("ALL");
  const [actionError, setActionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (productId === null && products.length > 0) setProductId(products[0].id);
  }, [products, productId]);

  const product = useResource<Product>(
    (signal) => (productId ? getProduct(productId, signal) : Promise.reject(new ApiError("not-found", "No product"))),
    [productId],
    { enabled: Boolean(productId) },
  );

  const findings = useResource<Finding[]>(
    (signal) => (productId ? getProductFindings(productId, signal) : Promise.resolve([])),
    [productId],
    { enabled: Boolean(productId) },
  );

  const checklist = useResource<ComplianceItem[]>(
    (signal) => (productId ? getComplianceItems(productId, signal) : Promise.resolve([])),
    [productId],
    { enabled: Boolean(productId) },
  );

  const documents = useResource(
    (signal) => (productId ? getProductDocuments(productId, signal) : Promise.resolve([])),
    [productId],
    { enabled: Boolean(productId) },
  );

  const analysis = useResource(
    (signal) => (productId ? getAnalysisStatus(productId, signal) : Promise.resolve(null)),
    [productId],
    { enabled: Boolean(productId), isEmpty: () => false },
  );

  const record = product.data;
  const allFindings = useMemo(() => findings.data ?? [], [findings.data]);
  const items = useMemo(() => checklist.data ?? [], [checklist.data]);
  const docs = useMemo(() => documents.data ?? [], [documents.data]);

  const highFindings = allFindings.filter((f) => f.severity === "HIGH").length;
  const mediumFindings = allFindings.filter((f) => f.severity === "MEDIUM").length;
  const lowFindings = allFindings.filter((f) => f.severity === "LOW").length;
  const openFindings = allFindings.filter((f) => f.status !== "RESOLVED").length;

  const passedItems = items.filter((item) => item.passed === true).length;
  const failedItems = items.filter((item) => item.passed === false).length;
  const pendingItems = items.filter((item) => item.passed === null).length;

  const categories = useMemo(
    () => Array.from(new Set(allFindings.map((f) => f.category).filter(Boolean))) as string[],
    [allFindings],
  );

  const visibleFindings = useMemo(() => {
    if (filter === "HIGH") return allFindings.filter((f) => f.severity === "HIGH");
    if (filter === "CATEGORY") return allFindings.filter((f) => Boolean(f.category));
    return allFindings;
  }, [allFindings, filter]);

  const riskTotal = highFindings + mediumFindings + lowFindings;
  const riskBar = (count: number) => (riskTotal > 0 ? (count / riskTotal) * 100 : 0);

  const overallStatus = useMemo(() => {
    if (analysis.data?.status === "PROCESSING" || analysis.data?.status === "QUEUED") {
      return { label: "Analysis In Progress", className: "bg-blue-50 text-blue-800 border border-blue-200", icon: "sync" };
    }
    if (openFindings === 0 && allFindings.length > 0) {
      return { label: "No Open Findings", className: "bg-emerald-50 text-emerald-800 border border-emerald-200", icon: "check_circle" };
    }
    if (highFindings > 0) {
      return { label: "Action Required", className: "bg-[#fff1f2] text-[#be123c] border border-[#fecdd3]", icon: "error" };
    }
    if (mediumFindings > 0) {
      return { label: "Review Required", className: "bg-[#fffbeb] border border-[#fde68a] text-[#b45309]", icon: "warning" };
    }
    return { label: "Not Assessed", className: "bg-surface-container text-on-surface-variant border border-outline-variant/50", icon: "hourglass_empty" };
  }, [analysis.data, openFindings, allFindings.length, highFindings, mediumFindings]);

  const runAnalysis = useCallback(async () => {
    if (!productId) return;
    setStarting(true);
    setActionError(null);
    try {
      await startAnalysis(productId);
      analysis.refetch();
      reloadProducts();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.userMessage : "The analysis could not be started.",
      );
    } finally {
      setStarting(false);
    }
  }, [productId, analysis, reloadProducts]);

  const anyLoading = () =>
    product.status === "loading" ||
    findings.status === "loading" ||
    checklist.status === "loading" ||
    documents.status === "loading";

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-space-lg gap-space-md border-b border-outline-variant/30">
        <div className="flex flex-col min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm mb-1"
          >
            <Link href="/products" className="hover:text-on-surface transition-colors">
              Products
            </Link>
            <Icon className="text-[13px]">chevron_right</Icon>
            {record ? (
              <>
                <Link href={`/products/${record.id}`} className="hover:text-on-surface transition-colors">
                  {record.name}
                </Link>
                <Icon className="text-[13px]">chevron_right</Icon>
              </>
            ) : null}
            <span className="text-on-surface font-semibold">Regulatory Readiness</span>
          </nav>
          <div className="flex items-center gap-space-sm flex-wrap">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none font-semibold">
              Regulatory Readiness{record ? `: ${record.name}` : ""}
            </h1>
            {record?.sku ? (
              <span className="font-data-mono text-data-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/40">
                {record.sku}
              </span>
            ) : null}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Target Market:{" "}
            <span className="font-medium text-on-surface">
              {record?.targetMarket ? MARKET_LABELS[record.targetMarket] : "Not set"}
            </span>
            <span className="mx-1.5 text-outline-variant">•</span>
            Analysis:{" "}
            <span className="font-data-mono text-secondary">
              {analysis.data?.status ? humanize(analysis.data.status) : "Not started"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <label htmlFor="readiness-product" className="sr-only">
              Select product
            </label>
            <select
              id="readiness-product"
              value={productId ?? ""}
              onChange={(event) => {
                setProductId(event.target.value || null);
              }}
              className="h-8 px-2 rounded bg-surface-container-lowest border border-outline-variant/60 text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
            >
              <option value="" disabled>
                Select a product
              </option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline" icon="sync" onClick={runAnalysis} disabled={!productId || starting}>
            {starting ? "Starting..." : "Re-run Analysis"}
          </Button>
          <Link href="/reviews">
            <Button variant="outline" icon="assignment_ind">
              Request Expert Review
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="solid" icon="picture_as_pdf">
              Export Dossier Report
            </Button>
          </Link>
        </div>
      </div>

      {!productId ? (
        <EmptyState
          icon="fact_check"
          title="No product selected"
          description="Regulatory readiness is evaluated per product. Create a product to begin."
          action={
            <Link href="/products/new">
              <Button variant="primary" icon="add_box">
                Create a product
              </Button>
            </Link>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon="fact_check"
          title="No compliance items"
          description="Create a product and run an analysis to generate the regulatory readiness checklist."
          action={
            <Link href="/products/new">
              <Button variant="primary" icon="add_box">
                Create your first product
              </Button>
            </Link>
          }
        />
      ) : anyLoading() ? (
        <LoadingState label="Loading regulatory readiness..." rows={6} />
      ) : product.status === "error" ? (
        <ErrorState
          title="Unable to load product readiness"
          message={product.error.userMessage}
          onRetry={product.refetch}
        />
      ) : (
        <>
          {actionError ? (
            <div className="mb-space-md">
              <ErrorState compact title="Action failed" message={actionError} />
            </div>
          ) : null}

          {analysis.data?.status === "PROCESSING" || analysis.data?.status === "QUEUED" ? (
            <div className="mb-space-md">
              <ProcessingState
                label={`Regulatory analysis ${humanize(analysis.data.status).toLowerCase()}`}
                detail={
                  typeof analysis.data.progress === "number"
                    ? `${analysis.data.progress}% reported by the backend`
                    : "The backend is running the compliance engine."
                }
              />
            </div>
          ) : null}

          <div className="mt-space-md bg-surface-container-lowest border border-outline-variant/40 rounded p-space-md">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-space-md items-center">
              <div className="xl:col-span-1 border-b md:border-b-0 md:border-r border-outline-variant/30 pr-space-md pb-space-sm md:pb-0">
                <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                  Overall Audit Status
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded ${overallStatus.className}`}
                >
                  <Icon className="text-[16px]">{overallStatus.icon}</Icon>
                  <span className="font-label-md text-label-md font-semibold tracking-tight">
                    {overallStatus.label}
                  </span>
                </div>
              </div>

              <div className="border-b md:border-b-0 md:border-r border-outline-variant/30 pr-space-md pb-space-sm md:pb-0">
                <div className="flex items-center justify-between text-on-surface-variant mb-0.5">
                  <span className="font-label-caps text-label-caps uppercase tracking-wider">
                    Ingredients
                  </span>
                  {record && record.ingredientCount > 0 ? (
                    <span className="font-data-mono text-data-mono text-error font-medium">
                      {openFindings} flagged
                    </span>
                  ) : null}
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {record?.ingredientCount ?? 0}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    recorded
                  </span>
                </div>
                <div className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  {record ? `${record.claimCount} claims • ${record.documentCount} documents` : "—"}
                </div>
              </div>

              <div className="border-b md:border-b-0 xl:border-r border-outline-variant/30 pr-space-md pb-space-sm md:pb-0">
                <div className="flex items-center justify-between text-on-surface-variant mb-0.5">
                  <span className="font-label-caps text-label-caps uppercase tracking-wider">
                    Claims Matrix
                  </span>
                  {record && record.claimCount > 0 ? (
                    <span className="font-data-mono text-data-mono text-[#b45309] font-medium">
                      {failedItems} open
                    </span>
                  ) : null}
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {record?.claimCount ?? 0}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    recorded
                  </span>
                </div>
                <div className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  Status assigned by the backend
                </div>
              </div>

              <div className="border-b md:border-b-0 md:border-r border-outline-variant/30 pr-space-md pb-space-sm md:pb-0">
                <div className="flex items-center justify-between text-on-surface-variant mb-0.5">
                  <span className="font-label-caps text-label-caps uppercase tracking-wider">
                    Document Vault
                  </span>
                  {docs.some((doc) => doc.status === "FAILED") ? (
                    <span className="font-data-mono text-data-mono text-error font-medium">
                      {docs.filter((doc) => doc.status === "FAILED").length} failed
                    </span>
                  ) : null}
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {docs.length}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    in dossier
                  </span>
                </div>
                <div className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  {docs.filter((doc) => doc.status === "PROCESSED").length} processed
                </div>
              </div>

              <div className="border-b md:border-b-0 md:border-r border-outline-variant/30 pr-space-md pb-space-sm md:pb-0">
                <div className="flex items-center justify-between text-on-surface-variant mb-0.5">
                  <span className="font-label-caps text-label-caps uppercase tracking-wider">
                    Compliance Checks
                  </span>
                  {items.length > 0 ? (
                    <span className="font-data-mono text-data-mono text-error font-medium">
                      {failedItems + pendingItems} open
                    </span>
                  ) : null}
                </div>
                <div className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  {items.length}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    identified
                  </span>
                </div>
                <div className="font-label-sm text-label-sm text-on-surface-variant truncate">
                  {passedItems} passed
                </div>
              </div>

              <div className="flex flex-col justify-center">
                <div className="flex items-center justify-between font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-1">
                  <span>Risk Allocation</span>
                  <span className="font-data-mono text-[11px] text-on-surface">
                    {allFindings.length} Nodes
                  </span>
                </div>
                <div
                  className="h-2 w-full bg-surface-container-high rounded overflow-hidden flex"
                  role="img"
                  aria-label={`${highFindings} high, ${mediumFindings} medium, ${lowFindings} low risk findings`}
                >
                  <div className="bg-error h-full" style={{ width: `${riskBar(highFindings)}%` }} />
                  <div className="bg-[#b45309] h-full" style={{ width: `${riskBar(mediumFindings)}%` }} />
                  <div className="bg-[#047857] h-full" style={{ width: `${riskBar(lowFindings)}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] font-data-mono text-on-surface-variant">
                  <span className="text-error font-semibold">{highFindings} High</span>
                  <span className="text-[#b45309] font-medium">{mediumFindings} Med</span>
                  <span className="text-[#047857] font-medium">{lowFindings} Low</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-lg grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
            <div className="xl:col-span-8 space-y-space-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs border-b border-outline-variant/30">
                <div className="flex items-center gap-space-sm">
                  <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">
                    Key Regulatory Findings
                  </h2>
                  <span className="font-data-mono text-data-mono bg-surface-container-highest px-2 py-0.5 rounded text-secondary font-semibold">
                    {openFindings} Actionable
                  </span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto text-label-sm font-label-sm">
                  <span className="text-on-surface-variant pr-1">Filter:</span>
                  {(
                    [
                      { key: "ALL", label: `All (${allFindings.length})` },
                      { key: "HIGH", label: `High Priority (${highFindings})` },
                      { key: "CATEGORY", label: `Categorised (${categories.length})` },
                    ] as { key: FindingFilter; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      aria-pressed={filter === item.key}
                      className={`px-2 py-0.5 rounded font-medium transition-colors ${
                        filter === item.key
                          ? "bg-surface-container-high text-on-surface border border-outline-variant/50"
                          : "hover:bg-surface-container-high text-on-surface-variant border border-transparent"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {findings.status === "loading" ? (
                <LoadingState label="Loading findings..." rows={4} />
              ) : findings.status === "error" ? (
                <ErrorState
                  title="Unable to load findings"
                  message={findings.error.userMessage}
                  onRetry={findings.refetch}
                />
              ) : allFindings.length === 0 ? (
                <EmptyState
                  icon="task_alt"
                  title="No findings available"
                  description={
                    analysis.data?.status === "COMPLETED"
                      ? "The analysis completed without producing findings."
                      : "Run a regulatory analysis to generate findings for this product."
                  }
                  action={
                    <Button variant="primary" icon="play_arrow" onClick={runAnalysis} disabled={starting}>
                      {starting ? "Starting..." : "Start Analysis"}
                    </Button>
                  }
                />
              ) : visibleFindings.length === 0 ? (
                <EmptyState
                  compact
                  icon="filter_alt_off"
                  title="No matching findings"
                  description="No findings match the current filter."
                  action={
                    <Button variant="outline" icon="restart_alt" onClick={() => setFilter("ALL")}>
                      Clear filter
                    </Button>
                  }
                />
              ) : (
                visibleFindings.map((finding) => {
                  const severity = severityStyle(finding.severity);
                  const status = findingStatusBadge(finding.status);
                  return (
                    <div
                      key={finding.id}
                      className="bg-surface-container-lowest border border-outline-variant/40 rounded p-space-md transition-colors hover:border-outline-variant/80"
                    >
                      <div className="flex items-start justify-between gap-space-md">
                        <div className="flex items-start gap-space-sm min-w-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider shrink-0 mt-0.5 ${severity.className}`}
                          >
                            {severity.label} Severity
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold leading-tight">
                              {finding.title}
                            </h3>
                            <p className="font-data-mono text-[11px] text-on-surface-variant">
                              {finding.id}
                              {finding.category ? ` • ${finding.category}` : ""}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-label-sm text-label-sm shrink-0 ${
                            finding.status === "RESOLVED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : finding.status === "OPEN"
                                ? "bg-error-container/40 text-on-error-container border border-error/20"
                                : "bg-amber-50 text-amber-800 border border-amber-200"
                          }`}
                        >
                          <Icon className="text-[13px]">{status.icon}</Icon>
                          {humanize(finding.status)}
                        </span>
                      </div>
                      {finding.summary ? (
                        <p className="font-body-sm text-body-sm text-on-surface leading-relaxed mt-2">
                          {finding.summary}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {finding.statutoryReference ? (
                          <div className="p-2 rounded bg-surface-container-low border border-outline-variant/40">
                            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant block">
                              Statutory Reference
                            </span>
                            <span className="font-data-mono text-[11px] text-secondary">
                              {finding.statutoryReference}
                            </span>
                          </div>
                        ) : null}
                        {finding.correctiveAction ? (
                          <div className="p-2 rounded bg-surface-container-low border border-outline-variant/40">
                            <span className="font-label-caps text-[10px] uppercase text-on-surface-variant block">
                              Corrective Action
                            </span>
                            <span className="text-body-sm text-on-surface">
                              {finding.correctiveAction}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-outline-variant/30">
                        <span className="font-data-mono text-[11px] text-on-surface-variant">
                          Detected {formatDate(finding.detectedAt)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/evidence?finding=${finding.id}`}>
                            <Button variant="ghost" size="sm" icon="policy">
                              View Evidence
                            </Button>
                          </Link>
                          <Link href="/reviews">
                            <Button variant="outline" size="sm" icon="rate_review">
                              Review
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="xl:col-span-4 space-y-space-md">
              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded p-space-md">
                <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Statutory Checklist
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Requirements identified by the compliance engine
                    </p>
                  </div>
                  <span className="font-data-mono text-data-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-semibold">
                    {passedItems} / {items.length} Pass
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-1.5 rounded overflow-hidden mb-space-md">
                  <div
                    className="bg-secondary h-full"
                    style={{ width: `${items.length > 0 ? toPercent(passedItems, items.length) : 0}%` }}
                  />
                </div>
                {checklist.status === "loading" ? (
                  <LoadingState label="Loading checklist..." rows={4} />
                ) : items.length === 0 ? (
                  <EmptyState
                    compact
                    icon="fact_check"
                    title="No compliance items"
                    description="The checklist is generated when an analysis runs."
                  />
                ) : (
                  <>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const passed = item.passed;
                        return (
                          <div
                            key={item.id}
                            className={`flex items-start gap-2.5 p-1.5 rounded ${
                              passed === false
                                ? "bg-error/5"
                                : passed === null
                                  ? "bg-[#fffbeb]/60"
                                  : "bg-transparent"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={passed === true}
                              disabled
                              aria-label={`${item.label} — ${
                                passed === true ? "passed" : passed === false ? "failed" : "pending"
                              }`}
                              className="mt-0.5 rounded border-outline-variant/80 text-primary focus:ring-0 w-4 h-4 cursor-not-allowed"
                            />
                            <div className="flex flex-col min-w-0">
                              <span
                                className={`font-body-sm text-body-sm font-medium line-through ${
                                  passed === true
                                    ? "text-on-surface opacity-70"
                                    : passed === false
                                      ? "text-error"
                                      : "text-[#b45309]"
                                }`}
                              >
                                {item.label}
                              </span>
                              {item.note ? (
                                <span
                                  className={`font-label-sm text-label-sm font-data-mono text-[10px] ${
                                    passed === false ? "text-error/80" : "text-on-surface-variant"
                                  }`}
                                >
                                  {item.note}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="font-body-sm text-[11px] text-on-surface-variant mt-3 pt-2 border-t border-outline-variant/30 leading-relaxed">
                      Checklist state is written by the backend compliance engine and by recorded human
                      decisions; it is read-only here.
                    </p>
                  </>
                )}
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/40 rounded p-space-md">
                <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Document Completeness
                    </h2>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      {docs.length} record{docs.length === 1 ? "" : "s"} in active dossier
                    </p>
                  </div>
                  <Link
                    href="/documents"
                    className="font-label-sm text-label-sm text-secondary hover:underline flex items-center gap-0.5"
                  >
                    <span>Vault</span>
                    <Icon className="text-[13px]">arrow_forward</Icon>
                  </Link>
                </div>
                {documents.status === "loading" ? (
                  <LoadingState label="Loading documents..." rows={3} />
                ) : docs.length === 0 ? (
                  <EmptyState
                    compact
                    icon="upload_file"
                    title="No documents uploaded"
                    description="Upload specifications, lab reports, and safety documents to complete the dossier."
                    action={
                      <Link href="/documents">
                        <Button variant="primary" size="sm" icon="cloud_upload">
                          Upload Document
                        </Button>
                      </Link>
                    }
                  />
                ) : (
                  <div className="space-y-1.5">
                    {docs.map((doc) => {
                      const badge = documentStatusBadge(doc.status);
                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between gap-2 p-2 rounded bg-surface-container-low border border-outline-variant/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Icon className="text-[16px] text-secondary shrink-0">description</Icon>
                            <span className="text-body-sm text-on-surface truncate">{doc.fileName}</span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              doc.status === "PROCESSED"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : doc.status === "FAILED"
                                  ? "bg-error-container text-on-error-container border border-error/20"
                                  : "bg-surface-container-high text-on-surface-variant border border-outline-variant/40"
                            }`}
                          >
                            <Icon className="text-[12px]">{badge.icon}</Icon>
                            {humanize(doc.status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
