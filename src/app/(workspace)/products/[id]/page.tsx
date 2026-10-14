"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState, ProcessingState } from "@/components/ui/states";
import { WorkflowStepper } from "@/components/products/WorkflowStepper";
import { useResource } from "@/lib/hooks/useResource";
import { useWorkspace } from "@/components/shell/AppShell";
import {
  getAnalysisStatus,
  getProduct,
  getProductClaims,
  getProductDocuments,
  getProductFindings,
  getProductIngredients,
  startAnalysis,
} from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import {
  claimStatusBadge,
  documentStatusBadge,
  findingStatusBadge,
  ingredientStatusBadge,
  productStatusBadge,
  riskStyle,
  severityStyle,
} from "@/lib/presentation";
import { formatBytes, formatDate, formatDateTime, humanize } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/routes";
import type {
  Claim,
  Finding,
  Product,
  ProductIngredient,
  VaultDocument,
} from "@/lib/api/types";

type TabKey = "findings" | "ingredients" | "claims" | "documents" | "workflow";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "workflow", label: "Workflow", icon: "account_tree" },
  { key: "findings", label: "Findings", icon: "report_problem" },
  { key: "ingredients", label: "Ingredients", icon: "science" },
  { key: "claims", label: "Claims", icon: "verified" },
  { key: "documents", label: "Documents", icon: "folder" },
];

/**
 * Product detail and analysis workflow. Every panel reflects backend state for
 * this product id; the analysis controls POST to the real analysis endpoints.
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params?.id ?? "";
  const { reloadProducts } = useWorkspace();

  const [tab, setTab] = useState<TabKey>("workflow");
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const product = useResource<Product>((signal) => getProduct(productId, signal), [productId]);

  const analysis = useResource(
    (signal) => getAnalysisStatus(productId, signal),
    [productId],
    { enabled: Boolean(productId), isEmpty: () => false },
  );

  const findings = useResource<Finding[]>(
    (signal) => getProductFindings(productId, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const ingredients = useResource<ProductIngredient[]>(
    (signal) => getProductIngredients(productId, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const claims = useResource<Claim[]>(
    (signal) => getProductClaims(productId, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const documents = useResource<VaultDocument[]>(
    (signal) => getProductDocuments(productId, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const record = product.data;
  const findingList = useMemo(() => findings.data ?? [], [findings.data]);
  const openFindings = findingList.filter((item) => item.status !== "RESOLVED");

  const runAnalysis = useCallback(async () => {
    setStarting(true);
    setActionError(null);
    try {
      await startAnalysis(productId);
      analysis.refetch();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.userMessage : "The analysis could not be started.",
      );
    } finally {
      setStarting(false);
    }
  }, [productId, analysis]);

  const refreshAll = useCallback(() => {
    product.refetch();
    analysis.refetch();
    findings.refetch();
    ingredients.refetch();
    claims.refetch();
    documents.refetch();
    reloadProducts();
  }, [product, analysis, findings, ingredients, claims, documents, reloadProducts]);

  const status = record ? productStatusBadge(record.status) : null;
  const analysisStatus = analysis.data?.status ?? "NOT_STARTED";
  const isRunning = analysisStatus === "PROCESSING" || analysisStatus === "QUEUED";

  const tabCounts: Record<TabKey, number> = {
    workflow: record?.stages.filter((stage) => stage.state === "COMPLETED").length ?? 0,
    findings: findingList.length,
    ingredients: ingredients.data?.length ?? 0,
    claims: claims.data?.length ?? 0,
    documents: documents.data?.length ?? 0,
  };

  if (!productId) {
    return <ErrorState title="Missing product" message="No product id was provided in the URL." />;
  }

  if (product.status === "loading") {
    return <LoadingState label="Loading product dossier..." rows={8} />;
  }

  if (product.status === "error") {
    return (
      <div className="flex flex-col gap-space-md">
        <ErrorState
          title="Unable to load product"
          message={product.error.userMessage}
          onRetry={product.refetch}
        />
        <div className="flex justify-center">
          <Button variant="outline" icon="arrow_back" onClick={() => router.push("/products")}>
            Back to products
          </Button>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <EmptyState
        icon="inventory_2"
        title="Product not found"
        description="This product does not exist or has been removed."
        action={
          <Link href="/products">
            <Button variant="primary" icon="arrow_back">
              Back to products
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md pb-space-lg border-b border-outline-variant/30">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm mb-1"
          >
            <Link href="/products" className="hover:text-on-surface transition-colors">
              Products
            </Link>
            <Icon className="text-[13px]">chevron_right</Icon>
            <span className="text-on-surface font-semibold">{record.name}</span>
          </nav>
          <div className="flex items-center gap-space-sm flex-wrap">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none font-semibold">
              {record.name}
            </h1>
            {record.sku ? (
              <span className="font-data-mono text-data-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface font-medium border border-outline-variant/40">
                {record.sku}
              </span>
            ) : null}
            {status ? (
              <Badge tone={status.tone} icon={status.icon}>
                {humanize(record.status)}
              </Badge>
            ) : null}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            {record.targetMarket ? MARKET_LABELS[record.targetMarket] : "No target market set"} •{" "}
            {record.category ? humanize(record.category) : "No category"} • Created{" "}
            {formatDate(record.createdAt)}
          </p>
          {record.description ? (
            <p className="font-body-sm text-body-sm text-on-surface mt-1 max-w-2xl">
              {record.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <Button variant="outline" icon="refresh" onClick={refreshAll}>
            Refresh
          </Button>
          <Link href="/documents">
            <Button variant="outline" icon="cloud_upload">
              Upload Document
            </Button>
          </Link>
          <Button
            variant="primary"
            icon={isRunning ? "sync" : "play_arrow"}
            onClick={runAnalysis}
            disabled={starting || isRunning}
            className={isRunning ? "[&_.material-symbols-outlined]:animate-spin" : undefined}
          >
            {starting
              ? "Starting..."
              : isRunning
                ? "Analysis Running"
                : analysisStatus === "COMPLETED"
                  ? "Re-run Analysis"
                  : "Start Analysis"}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="mt-space-md">
          <ErrorState compact title="Action failed" message={actionError} />
        </div>
      ) : null}

      {isRunning ? (
        <div className="mt-space-md">
          <ProcessingState
            label={`Regulatory analysis ${humanize(analysisStatus).toLowerCase()}`}
            detail={
              typeof analysis.data?.progress === "number"
                ? `${analysis.data.progress}% reported by the backend`
                : "Waiting for the compliance engine."
            }
          />
        </div>
      ) : analysis.data?.status === "FAILED" ? (
        <div className="mt-space-md">
          <ErrorState
            compact
            title="Analysis failed"
            message={
              analysis.data.failureReason ??
              "The backend reported a failed analysis. Re-run the analysis to try again."
            }
            onRetry={runAnalysis}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-space-sm mt-space-md">
        {[
          { label: "Ingredients", value: record.ingredientCount, icon: "science" },
          { label: "Claims", value: record.claimCount, icon: "verified" },
          { label: "Documents", value: record.documentCount, icon: "folder" },
          { label: "Findings", value: record.findingCount, icon: "report_problem" },
          { label: "High Risk", value: record.risks.high, icon: "warning", tone: "text-error" },
          { label: "Last Analysis", value: formatDate(record.lastAnalysisAt), icon: "update" },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface-container-lowest rounded border border-outline-variant/50 p-space-md flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
              <span>{card.label}</span>
              <Icon className="text-[16px] text-secondary">{card.icon}</Icon>
            </div>
            <div className={`font-headline-lg text-headline-lg font-semibold mt-1 ${card.tone ?? "text-on-surface"}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-space-lg flex items-center gap-space-lg border-b border-outline-variant/60 overflow-x-auto">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key}
            className={`pb-space-sm font-label-md text-label-md whitespace-nowrap flex items-center gap-1.5 transition-colors ${
              tab === item.key
                ? "text-secondary border-b-2 border-secondary font-semibold"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon className="text-[16px]">{item.icon}</Icon>
            <span>{item.label}</span>
            {item.key !== "workflow" ? (
              <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-data-mono text-[10px]">
                {tabCounts[item.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-space-md">
        {tab === "workflow" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md items-start">
            <div className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md shadow-sm">
              <WorkflowStepper stages={record.stages} />
            </div>
            <div className="lg:col-span-5 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md shadow-sm">
                <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant/30 mb-space-sm">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                    Analysis Status
                  </h2>
                  <Badge
                    tone={
                      analysisStatus === "COMPLETED"
                        ? "success"
                        : analysisStatus === "FAILED"
                          ? "danger"
                          : isRunning
                            ? "active"
                            : "muted"
                    }
                    icon={humanize(analysisStatus) === "Not started" ? "hourglass_empty" : "sync"}
                  >
                    {humanize(analysisStatus)}
                  </Badge>
                </div>
                <dl className="space-y-1.5 text-body-sm font-body-sm">
                  {[
                    ["Analysis ID", analysis.data?.id ?? "—"],
                    ["Progress", typeof analysis.data?.progress === "number" ? `${analysis.data.progress}%` : "—"],
                    ["Started", formatDateTime(analysis.data?.startedAt)],
                    ["Completed", formatDateTime(analysis.data?.completedAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <dt className="text-on-surface-variant">{label}</dt>
                      <dd className="font-data-mono text-[11px] text-on-surface text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
                {analysis.data?.failureReason ? (
                  <p className="font-body-sm text-body-sm text-error mt-2">{analysis.data.failureReason}</p>
                ) : null}
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md shadow-sm">
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold pb-space-sm border-b border-outline-variant/30 mb-space-sm">
                  Risk Profile
                </h2>
                {record.risks.high + record.risks.medium + record.risks.low === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No findings have been produced for this product yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {[
                      { label: "High", value: record.risks.high, className: "text-error", bar: "bg-error" },
                      { label: "Medium", value: record.risks.medium, className: "text-amber-800", bar: "bg-[#b45309]" },
                      { label: "Low", value: record.risks.low, className: "text-emerald-700", bar: "bg-[#047857]" },
                    ].map((row) => {
                      const total = record.risks.high + record.risks.medium + record.risks.low;
                      return (
                        <div key={row.label} className="flex items-center gap-2">
                          <span className={`font-label-sm text-label-sm w-14 ${row.className}`}>
                            {row.label}
                          </span>
                          <div className="flex-1 h-1.5 bg-surface-container-high rounded overflow-hidden">
                            <div
                              className={`h-full ${row.bar}`}
                              style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="font-data-mono text-[11px] text-on-surface w-6 text-right">
                            {row.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Link href={`/readiness?product=${record.id}`}>
                  <Button variant="outline" icon="fact_check" className="w-full">
                    Open Regulatory Readiness
                  </Button>
                </Link>
                <Link href={`/compliance?product=${record.id}`}>
                  <Button variant="outline" icon="checklist" className="w-full">
                    Compliance Checklist
                  </Button>
                </Link>
                <Link href={`/reports?product=${record.id}`}>
                  <Button variant="outline" icon="picture_as_pdf" className="w-full">
                    Reports
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "findings" ? (
          findings.status === "loading" ? (
            <LoadingState label="Loading findings..." rows={5} />
          ) : findings.status === "error" ? (
            <ErrorState
              title="Unable to load findings"
              message={findings.error.userMessage}
              onRetry={findings.refetch}
            />
          ) : findingList.length === 0 ? (
            <EmptyState
              icon="report_problem"
              title="No findings available"
              description={
                analysisStatus === "COMPLETED"
                  ? "The analysis completed without producing findings for this product."
                  : "Start a regulatory analysis to generate findings."
              }
              action={
                <Button variant="primary" icon="play_arrow" onClick={runAnalysis} disabled={starting || isRunning}>
                  {starting ? "Starting..." : "Start Analysis"}
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-space-sm">
              {openFindings.length > 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  {openFindings.length} of {findingList.length} findings require action.
                </p>
              ) : null}
              {findingList.map((finding) => {
                const severity = severityStyle(finding.severity);
                const badge = findingStatusBadge(finding.status);
                return (
                  <div
                    key={finding.id}
                    className="bg-surface-container-lowest border border-outline-variant/50 rounded p-space-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider shrink-0 ${severity.className}`}
                        >
                          {severity.label}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                            {finding.title}
                          </h3>
                          <p className="font-data-mono text-[11px] text-on-surface-variant">
                            {finding.id}
                            {finding.category ? ` • ${finding.category}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge tone={badge.tone} icon={badge.icon}>
                        {humanize(finding.status)}
                      </Badge>
                    </div>
                    {finding.summary ? (
                      <p className="font-body-sm text-body-sm text-on-surface mt-2">{finding.summary}</p>
                    ) : null}
                    {finding.correctiveAction ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                        <span className="font-medium text-on-surface">Corrective action: </span>
                        {finding.correctiveAction}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-outline-variant/30">
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        {finding.statutoryReference ?? "No statutory reference returned"} •{" "}
                        {formatDate(finding.detectedAt)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/evidence?finding=${finding.id}`}>
                          <Button variant="ghost" size="sm" icon="policy">
                            Evidence
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
              })}
            </div>
          )
        ) : null}

        {tab === "ingredients" ? (
          ingredients.status === "loading" ? (
            <LoadingState label="Loading ingredients..." rows={5} />
          ) : ingredients.status === "error" ? (
            <ErrorState
              title="Unable to load ingredients"
              message={ingredients.error.userMessage}
              onRetry={ingredients.refetch}
            />
          ) : (ingredients.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="science"
              title="No ingredients added"
              description="Add formulation ingredients to evaluate them against the target jurisdiction."
              action={
                <Link href="/documents">
                  <Button variant="primary" icon="upload_file">
                    Upload formulation document
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                      <th className="px-space-md py-2">Ingredient</th>
                      <th className="px-space-sm py-2">CAS</th>
                      <th className="px-space-sm py-2">Amount</th>
                      <th className="px-space-sm py-2">Status</th>
                      <th className="px-space-sm py-2 pr-space-md text-right">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm">
                    {(ingredients.data ?? []).map((item) => {
                      const badge = ingredientStatusBadge(item.status);
                      const risk = riskStyle(item.riskLevel);
                      return (
                        <tr key={item.id}>
                          <td className="px-space-md py-2.5 font-medium text-on-surface">{item.name}</td>
                          <td className="px-space-sm py-2.5 font-data-mono text-[11px] text-on-surface-variant">
                            {item.casNumber ?? "—"}
                          </td>
                          <td className="px-space-sm py-2.5 font-data-mono text-[11px] text-on-surface-variant">
                            {item.amountPerServing ?? "—"}
                            {item.amountUnit ? ` ${item.amountUnit}` : ""}
                          </td>
                          <td className="px-space-sm py-2.5">
                            <Badge tone={badge.tone} icon={badge.icon}>
                              {humanize(item.status)}
                            </Badge>
                          </td>
                          <td className="px-space-sm py-2.5 pr-space-md text-right">
                            <span
                              className={`font-data-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${risk.className}`}
                            >
                              {risk.label.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : null}

        {tab === "claims" ? (
          claims.status === "loading" ? (
            <LoadingState label="Loading claims..." rows={5} />
          ) : claims.status === "error" ? (
            <ErrorState
              title="Unable to load claims"
              message={claims.error.userMessage}
              onRetry={claims.refetch}
            />
          ) : (claims.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="verified"
              title="No claims added"
              description="Add product claims to evaluate their regulatory requirements."
              action={
                <Link href="/claims">
                  <Button variant="primary" icon="add">
                    Add Claim
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                      <th className="px-space-md py-2">Claim</th>
                      <th className="px-space-sm py-2">Type</th>
                      <th className="px-space-sm py-2">Status</th>
                      <th className="px-space-sm py-2">Evidence</th>
                      <th className="px-space-sm py-2 pr-space-md text-right">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm">
                    {(claims.data ?? []).map((claim) => {
                      const badge = claimStatusBadge(claim.status);
                      const risk = riskStyle(claim.riskLevel);
                      return (
                        <tr key={claim.id}>
                          <td className="px-space-md py-2.5">
                            <div className="font-medium text-on-surface">{claim.text}</div>
                            <div className="font-data-mono text-[11px] text-on-surface-variant">
                              {claim.id}
                            </div>
                          </td>
                          <td className="px-space-sm py-2.5 text-on-surface-variant">
                            {claim.claimType ? humanize(claim.claimType) : "—"}
                          </td>
                          <td className="px-space-sm py-2.5">
                            <Badge tone={badge.tone} icon={badge.icon}>
                              {humanize(claim.status)}
                            </Badge>
                          </td>
                          <td className="px-space-sm py-2.5 font-data-mono text-[11px]">
                            {claim.evidenceCount}
                          </td>
                          <td className="px-space-sm py-2.5 pr-space-md text-right">
                            <span
                              className={`font-data-mono text-[10px] font-semibold px-1.5 py-0.5 rounded ${risk.className}`}
                            >
                              {risk.label.toUpperCase()}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : null}

        {tab === "documents" ? (
          documents.status === "loading" ? (
            <LoadingState label="Loading documents..." rows={5} />
          ) : documents.status === "error" ? (
            <ErrorState
              title="Unable to load documents"
              message={documents.error.userMessage}
              onRetry={documents.refetch}
            />
          ) : (documents.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon="upload_file"
              title="No documents uploaded"
              description="Upload product specifications, lab reports, safety documents, or other regulatory documents."
              action={
                <Link href="/documents">
                  <Button variant="primary" icon="cloud_upload">
                    Upload Document
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant/60 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                      <th className="px-space-md py-2">Document</th>
                      <th className="px-space-sm py-2">Type</th>
                      <th className="px-space-sm py-2">Size</th>
                      <th className="px-space-sm py-2">Extraction</th>
                      <th className="px-space-sm py-2">Status</th>
                      <th className="px-space-sm py-2 pr-space-md">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm">
                    {(documents.data ?? []).map((doc) => {
                      const badge = documentStatusBadge(doc.status);
                      return (
                        <tr key={doc.id}>
                          <td className="px-space-md py-2.5">
                            <div className="flex items-center gap-2">
                              <Icon className="text-[16px] text-secondary">description</Icon>
                              <div>
                                <div className="font-medium text-on-surface">{doc.fileName}</div>
                                <div className="font-data-mono text-[11px] text-on-surface-variant">
                                  {doc.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-space-sm py-2.5 text-on-surface-variant">
                            {doc.documentType ? humanize(doc.documentType) : "—"}
                          </td>
                          <td className="px-space-sm py-2.5 font-data-mono text-[11px] text-on-surface-variant">
                            {formatBytes(doc.sizeBytes)}
                          </td>
                          <td className="px-space-sm py-2.5 text-on-surface-variant">
                            {doc.extractionStatus ? humanize(doc.extractionStatus) : "—"}
                          </td>
                          <td className="px-space-sm py-2.5">
                            <Badge tone={badge.tone} icon={badge.icon}>
                              {humanize(doc.status)}
                            </Badge>
                          </td>
                          <td className="px-space-sm py-2.5 pr-space-md font-data-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                            {formatDateTime(doc.uploadedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
