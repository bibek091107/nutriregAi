"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button } from "@/components/ui/controls";
import { Panel } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingState, ProcessingState } from "@/components/ui/states";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import { getDocuments } from "@/lib/api/products";
import { documentStatusBadge } from "@/lib/presentation";
import { formatBytes, formatDateTime, humanize } from "@/lib/format";
import type { DocumentStatus, VaultDocument } from "@/lib/api/types";
import { UploadDocumentModal } from "@/components/documents/UploadDocumentModal";

const STATUS_FILTERS: { value: "ALL" | DocumentStatus; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "UPLOADED", label: "Uploaded" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PROCESSED", label: "Processed" },
  { value: "FAILED", label: "Failed" },
];

/** Documents still being extracted are polled until the backend reports otherwise. */
const ACTIVE_STATUSES: DocumentStatus[] = ["UPLOADING", "UPLOADED", "PROCESSING"];

export default function DocumentsPage() {
  const { products, reloadProducts } = useWorkspace();
  const [productId, setProductId] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | DocumentStatus>("ALL");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(
    (signal: AbortSignal) =>
      getDocuments(signal, {
        productId: productId === "ALL" ? undefined : productId,
        status: status === "ALL" ? undefined : status,
      }),
    [productId, status],
  );

  const documents = useResource<VaultDocument[]>(load, [productId, status]);

  const all = useMemo(() => documents.data ?? [], [documents.data]);

  const hasActive = all.some((doc) => ACTIVE_STATUSES.includes(doc.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(documents.refetch, 4000);
    return () => window.clearInterval(timer);
  }, [hasActive, documents.refetch]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (doc) =>
        doc.fileName.toLowerCase().includes(term) ||
        (doc.productName ?? "").toLowerCase().includes(term) ||
        humanize(doc.documentType).toLowerCase().includes(term),
    );
  }, [all, search]);

  const processed = all.filter((doc) => doc.status === "PROCESSED").length;
  const processing = all.filter((doc) => doc.status === "PROCESSING").length;
  const failed = all.filter((doc) => doc.status === "FAILED").length;
  const totalBytes = all.reduce((sum, doc) => sum + (doc.sizeBytes ?? 0), 0);

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-lg">
        <div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
            Document Vault
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Encrypted, batch-processed storage for all regulatory dossiers and lab reports.
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <Button
            variant="outline"
            icon="folder_open"
            disabled
            title="Document categories are defined by the NutriReg API (document_type) and cannot be edited from the client."
          >
            Manage Categories
          </Button>
          <Button variant="primary" icon="cloud_upload" onClick={() => setUploadOpen(true)}>
            Upload Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm mb-space-lg">
        {[
          { label: "Total Documents", value: all.length, icon: "folder", tone: "bg-surface-container text-secondary" },
          { label: "Processed", value: processed, icon: "task_alt", tone: "bg-emerald-50 text-emerald-700" },
          { label: "Processing", value: processing, icon: "sync", tone: "bg-surface-container text-secondary" },
          { label: "Vault Size", value: formatBytes(totalBytes), icon: "database", tone: "bg-surface-container text-secondary" },
        ].map((card) => (
          <Panel key={card.label} className="p-space-md flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider">
                {card.label}
              </span>
              <span className="font-headline-xl text-headline-xl font-bold text-on-surface mt-1">
                {card.value}
              </span>
            </div>
            <div className={`p-2 rounded ${card.tone}`}>
              <Icon className="text-[20px]">{card.icon}</Icon>
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="p-space-md mb-space-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-sm">
          <div className="relative flex-1">
            <label htmlFor="doc-search" className="sr-only">
              Search documents
            </label>
            <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </Icon>
            <input
              id="doc-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by file name, SKU, or type..."
              className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface border border-outline-variant/60 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary text-on-surface placeholder:text-on-surface-variant/70"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 overflow-x-auto">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  aria-pressed={status === filter.value}
                  className={`h-7 px-2.5 rounded font-label-sm text-label-sm font-medium shrink-0 transition-colors ${
                    status === filter.value
                      ? "bg-primary-container text-on-primary"
                      : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant border border-outline-variant/40"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="doc-product" className="sr-only">
                Filter by product
              </label>
              <select
                id="doc-product"
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className="h-7 pl-2 pr-6 text-label-sm font-label-sm rounded bg-surface border border-outline-variant/60 text-on-surface focus:outline-none focus:border-secondary"
              >
                <option value="ALL">All Products</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Panel>

      {documents.status === "loading" ? (
        <LoadingState label="Loading document vault..." rows={6} />
      ) : documents.status === "error" ? (
        <ErrorState
          title="Unable to load the document vault"
          message={documents.error.userMessage}
          onRetry={documents.refetch}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="upload_file"
          title="Your vault is empty"
          description="Upload a certificate of analysis or product specification to begin regulatory analysis."
          action={
            <Button variant="primary" icon="cloud_upload" onClick={() => setUploadOpen(true)}>
              Upload Document
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon="search_off"
          title="No matching documents"
          description="No documents match the current search or filters."
          action={
            <Button
              variant="outline"
              icon="restart_alt"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
                setProductId("ALL");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {processing > 0 ? (
            <div className="mb-space-md">
              <ProcessingState
                label={`${processing} document${processing === 1 ? "" : "s"} being extracted`}
                detail="Content extraction runs on the backend. This list refreshes automatically."
              />
            </div>
          ) : null}

          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                    <th className="px-space-sm py-2">Document</th>
                    <th className="px-space-sm py-2">Product / SKU</th>
                    <th className="px-space-sm py-2">Classification</th>
                    <th className="px-space-sm py-2">Size</th>
                    <th className="px-space-sm py-2">Status</th>
                    <th className="px-space-sm py-2">Uploaded</th>
                    <th className="px-space-sm py-2 pr-space-md text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm text-on-surface">
                  {visible.map((doc) => {
                    const badge = documentStatusBadge(doc.status);
                    return (
                      <tr key={doc.id} className="hover:bg-surface-container-low/40 transition-colors">
                        <td className="px-space-sm py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-surface-container-lowest border border-outline-variant/40 flex items-center justify-center text-secondary shrink-0">
                              <Icon className="text-[16px]">description</Icon>
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-on-surface truncate max-w-[240px]">
                                {doc.fileName}
                              </div>
                              <div className="font-data-mono text-[11px] text-on-surface-variant">
                                {doc.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-space-sm py-2.5 text-on-surface-variant">
                          {doc.productName ?? (
                            <span className="font-data-mono text-[11px]">Global baseline</span>
                          )}
                        </td>
                        <td className="px-space-sm py-2.5 text-on-surface-variant whitespace-nowrap">
                          {doc.documentType ? humanize(doc.documentType) : "—"}
                        </td>
                        <td className="px-space-sm py-2.5 font-data-mono text-[11px] text-on-surface-variant">
                          {formatBytes(doc.sizeBytes)}
                        </td>
                        <td className="px-space-sm py-2.5">
                          <Badge tone={badge.tone} icon={badge.icon}>
                            {humanize(doc.status)}
                          </Badge>
                        </td>
                        <td className="px-space-sm py-2.5 font-data-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                          {formatDateTime(doc.uploadedAt)}
                        </td>
                        <td className="px-space-sm py-2.5 pr-space-md text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.status === "PROCESSED" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon="preview"
                                disabled
                                title="The NutriReg API does not expose a document file or preview endpoint for this record."
                              >
                                Preview
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              icon="rate_review"
                              disabled
                              title={
                                doc.productId
                                  ? "The NutriReg API does not expose a document-to-finding linking endpoint, so this link cannot be created from the client."
                                  : "This document is not associated with a product."
                              }
                            >
                              Link Finding
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {failed > 0 ? (
            <Panel className="mt-space-md p-space-md">
              <div className="flex items-start gap-2">
                <Icon className="text-[18px] text-error mt-0.5">error</Icon>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md font-medium text-on-surface">
                    {failed} document{failed === 1 ? "" : "s"} failed to process
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Re-upload the source file once the issue is resolved. Failure reasons are
                    reported by the backend on each row.
                  </span>
                </div>
              </div>
            </Panel>
          ) : null}
        </>
      )}

      <UploadDocumentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        products={products}
        onUploaded={() => {
          documents.refetch();
          reloadProducts();
        }}
      />
    </div>
  );
}
