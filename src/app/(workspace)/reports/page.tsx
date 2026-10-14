"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState, ProcessingState } from "@/components/ui/states";
import { ProductSelect } from "@/components/products/ProductSelect";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import { getProductReports, requestReport } from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import { reportStatusBadge } from "@/lib/presentation";
import { formatDateTime, humanize } from "@/lib/format";
import type { ComplianceReport } from "@/lib/api/types";

function ReportsPageContent() {
  const searchParams = useSearchParams();
  const { products, productsError, reloadProducts } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("product"));

  const productId = selectedId ?? products[0]?.id ?? null;

  const reports = useResource<ComplianceReport[]>(
    (signal) => getProductReports(productId as string, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const [requesting, setRequesting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reportList = reports.data ?? [];
  const hasActive = reportList.some(
    (report) => report.status === "PENDING" || report.status === "GENERATING",
  );

  const request = useCallback(async () => {
    if (!productId) return;
    setRequesting(true);
    setActionError(null);
    try {
      await requestReport(productId);
      reports.refetch();
    } catch (caught) {
      setActionError(
        caught instanceof ApiError ? caught.userMessage : "The report request could not be sent.",
      );
    } finally {
      setRequesting(false);
    }
  }, [productId, reports]);

  if (productsError && products.length === 0) {
    return (
      <ErrorState
        title="Unable to load products"
        message="The product list could not be retrieved from the NutriReg API, so reports cannot be scoped."
        onRetry={reloadProducts}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="assessment"
        title="No products available"
        description="Audit reports are generated per product. Create a product to begin."
        action={
          <Link href="/products/new">
            <Button variant="primary" icon="add_box">
              Create a product
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md pb-space-lg border-b border-outline-variant/30">
        <div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none font-semibold">
            Audit Reports
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1.5 max-w-2xl">
            Generated compliance dossiers and audit trails produced by the backend. Files are only
            downloadable once the backend reports them as ready.
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <ProductSelect products={products} value={productId} onChange={setSelectedId} />
          <Button
            variant="outline"
            icon="sync"
            disabled={!productId}
            onClick={reports.refetch}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={requesting || hasActive ? "sync" : "picture_as_pdf"}
            onClick={request}
            disabled={requesting || hasActive || !productId}
            className={hasActive ? "[&_.material-symbols-outlined]:animate-spin" : undefined}
          >
            {requesting ? "Requesting..." : hasActive ? "Report Generating" : "Generate Report"}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="mt-space-md">
          <ErrorState compact title="Request failed" message={actionError} />
        </div>
      ) : null}

      {reports.status === "loading" ? (
        <div className="mt-space-md">
          <LoadingState label="Loading reports..." rows={4} />
        </div>
      ) : reports.status === "error" ? (
        <div className="mt-space-md">
          <ErrorState
            title="Unable to load reports"
            message={reports.error.userMessage}
            onRetry={reports.refetch}
          />
        </div>
      ) : reportList.length === 0 ? (
        <div className="mt-space-md">
          <EmptyState
            icon="picture_as_pdf"
            title="No reports generated"
            description="Request an audit report to have the backend compile the current compliance dossier for this product."
            action={
              <Button
                variant="primary"
                icon="picture_as_pdf"
                onClick={request}
                disabled={requesting}
              >
                {requesting ? "Requesting..." : "Generate Report"}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {hasActive ? (
            <div className="mt-space-md">
              <ProcessingState
                label="Report generation in progress"
                detail="The backend is compiling the audit dossier. This page reflects the reported status."
              />
            </div>
          ) : null}

          <div className="mt-space-md grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
            <div className="xl:col-span-8 bg-surface-container-lowest border border-outline-variant/60 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                      <th className="px-space-md py-2">Report</th>
                      <th className="px-space-sm py-2">Product</th>
                      <th className="px-space-sm py-2">Status</th>
                      <th className="px-space-sm py-2">Generated</th>
                      <th className="px-space-sm py-2 pr-space-md text-right">File</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm">
                    {reportList.map((report) => {
                      const badge = reportStatusBadge(report.status);
                      const ready = report.status === "READY" && Boolean(report.downloadUrl);
                      return (
                        <tr key={report.id} className="hover:bg-surface-container-low/40">
                          <td className="px-space-md py-3">
                            <div className="flex items-center gap-2">
                              <Icon className="text-[18px] text-secondary">description</Icon>
                              <div className="min-w-0">
                                <div className="font-medium text-on-surface">{report.title}</div>
                                <div className="font-data-mono text-[11px] text-on-surface-variant">
                                  {report.id}
                                </div>
                              </div>
                            </div>
                            {report.failureReason ? (
                              <p className="font-body-sm text-[11px] text-error mt-1 ml-6">
                                {report.failureReason}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-space-sm py-3 text-on-surface-variant whitespace-nowrap">
                            {report.productName}
                          </td>
                          <td className="px-space-sm py-3">
                            <Badge tone={badge.tone} icon={badge.icon}>
                              {humanize(report.status)}
                            </Badge>
                          </td>
                          <td className="px-space-sm py-3 font-data-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                            {formatDateTime(report.generatedAt)}
                          </td>
                          <td className="px-space-sm py-3 pr-space-md text-right whitespace-nowrap">
                            {ready && report.downloadUrl ? (
                              <a
                                href={report.downloadUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-secondary hover:bg-secondary-container text-on-secondary font-label-sm text-label-sm transition-colors"
                              >
                                <Icon className="text-[14px]">download</Icon>
                                Download
                              </a>
                            ) : (
                              <span className="font-body-sm text-[11px] text-on-surface-variant">
                                {report.status === "FAILED"
                                  ? "Unavailable"
                                  : "Pending"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="xl:col-span-4 bg-surface-container-low/60 border border-outline-variant/60 rounded p-space-md">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-1.5">
                <Icon className="text-[16px] text-secondary">info</Icon>
                Report Contents
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                Report composition is decided by the backend. A typical dossier covers the
                following, using only data recorded for the selected product:
              </p>
              <ul className="mt-space-sm flex flex-col gap-1.5">
                {[
                  "Product composition and ingredient register",
                  "Claim substantiation matrix with linked evidence",
                  "Document inventory and extraction status",
                  "Findings register with severity and disposition",
                  "Statutory references and human review audit trail",
                ].map((entry) => (
                  <li key={entry} className="flex items-start gap-2">
                    <Icon className="text-[15px] text-secondary mt-0.5">check</Icon>
                    <span className="font-body-sm text-body-sm text-on-surface">{entry}</span>
                  </li>
                ))}
              </ul>
              <p className="font-body-sm text-[11px] text-on-surface-variant mt-space-sm pt-space-sm border-t border-outline-variant/40">
                NutriReg AI does not generate regulatory conclusions. Report content is assembled
                from records stored by the compliance engine.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading reports..." rows={4} />}>
      <ReportsPageContent />
    </Suspense>
  );
}
