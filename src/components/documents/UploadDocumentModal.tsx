"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { Modal } from "@/components/ui/Modal";
import {
  ACCEPT_ATTRIBUTE,
  ApiError,
  MAX_UPLOAD_BYTES,
  validateUpload,
} from "@/lib/api/client";
import { uploadDocument } from "@/lib/api/products";
import { formatBytes } from "@/lib/format";
import type { DocumentType, Product } from "@/lib/api/types";

const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "PRODUCT_SPEC", label: "Product Specification (Finished Good)" },
  { value: "CERTIFICATE_OF_ANALYSIS", label: "Lab Report / CoA" },
  { value: "LAB_REPORT", label: "Analytical Lab Report" },
  { value: "SAFETY_SHEET", label: "Safety Data Sheet" },
  { value: "LABEL_ARTWORK", label: "Label Artwork / Packaging Proof" },
  { value: "OTHER", label: "Regulatory Certificate / Other" },
];

type UploadPhase = "idle" | "uploading" | "success" | "error";

/**
 * Upload dialog implementing the designed drop zone with real validation,
 * real progress, and a real POST. Nothing is simulated: if the backend is
 * unreachable the dialog reports the failure and no document is added.
 */
export function UploadDocumentModal({
  open,
  onClose,
  products,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [documentType, setDocumentType] = useState<DocumentType>("CERTIFICATE_OF_ANALYSIS");
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null);
    setNotes("");
    setPhase("idle");
    setProgress(0);
    setError(null);
    setDragging(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const acceptFile = (candidate: File | null) => {
    if (!candidate) return;
    const validationError = validateUpload(candidate);
    if (validationError) {
      setFile(null);
      setError(validationError);
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const upload = useCallback(async () => {
    if (!file) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    const fields: Record<string, string> = { documentType };
    if (productId) fields.productId = productId;
    if (notes.trim()) fields.notes = notes.trim();

    try {
      await uploadDocument(file, fields, setProgress, controller.signal);
      setPhase("success");
      setProgress(100);
      onUploaded();
    } catch (caught) {
      if (caught instanceof ApiError && caught.kind === "aborted") {
        setPhase("idle");
        return;
      }
      setPhase("error");
      setError(caught instanceof ApiError ? caught.userMessage : "Document upload failed.");
    } finally {
      abortRef.current = null;
    }
  }, [file, productId, documentType, notes, onUploaded]);

  const busy = phase === "uploading";

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
      title="Upload Regulatory Dossier Document"
      description={
        products.length > 0
          ? `Attach a file to ${products.find((p) => p.id === productId)?.name ?? "a dossier"}.`
          : "Attach a file to the global statutory baseline."
      }
      labelledBy="upload-document-title"
    >
      <div className="p-space-lg flex flex-col gap-space-md">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0] ?? null);
          }}
          className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer text-center ${
            dragging
              ? "border-secondary bg-surface-container-low"
              : "border-outline-variant hover:border-secondary bg-surface-container-low/50 hover:bg-surface-container-low"
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-surface-container-lowest border border-outline-variant/40 flex items-center justify-center text-secondary">
            <Icon className="text-[24px]">cloud_upload</Icon>
          </div>
          <div className="flex flex-col">
            <span className="font-label-md text-label-md font-semibold text-on-surface">
              Drag &amp; drop document files here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-secondary underline"
              >
                browse
              </button>
            </span>
            <span className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
              Supported formats: PDF, DOCX, XLSX, PNG, JPG (up to{" "}
              {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB per file)
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/40 font-data-mono text-[10px] text-on-surface-variant">
              Extraction reported by backend
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />
        </div>

        {file ? (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded border border-outline-variant/50 bg-surface-container-lowest">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="text-[18px] text-secondary shrink-0">description</Icon>
              <div className="flex flex-col min-w-0">
                <span className="font-label-md text-label-md text-on-surface truncate">
                  {file.name}
                </span>
                <span className="font-data-mono text-[11px] text-on-surface-variant">
                  {formatBytes(file.size)} · {file.type || "unknown type"}
                </span>
              </div>
            </div>
            {!busy ? (
              <button
                type="button"
                onClick={reset}
                aria-label="Remove selected file"
                className="p-1 rounded text-on-surface-variant hover:text-error hover:bg-error-container/30"
              >
                <Icon className="text-[18px]">close</Icon>
              </button>
            ) : null}
          </div>
        ) : null}

        {phase === "uploading" ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col gap-1.5 p-2.5 rounded border border-outline-variant/50 bg-surface-container-low/60"
          >
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface flex items-center gap-1.5">
                <Icon className="text-[16px] text-secondary animate-spin">sync</Icon>
                Uploading document...
              </span>
              <span className="font-data-mono text-[11px] text-on-surface">{progress}%</span>
            </div>
            <div
              className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div className="bg-secondary h-full rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {phase === "success" ? (
          <div
            role="status"
            className="flex items-start gap-2 p-2.5 rounded border border-emerald-200 bg-emerald-50"
          >
            <Icon className="text-[16px] text-emerald-700 mt-0.5">check_circle</Icon>
            <span className="font-body-sm text-body-sm text-emerald-800">
              Document uploaded. Processing status is now tracked from the backend.
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm font-body-sm">
          <div className="flex flex-col gap-1">
            <label htmlFor="upload-product" className="font-label-md text-label-md font-medium text-on-surface">
              Target Product / SKU
            </label>
            <select
              id="upload-product"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded text-on-surface focus:outline-none focus:border-secondary"
            >
              <option value="">Global Statutory Baseline (No SKU)</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.sku ? ` (${product.sku})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="upload-type" className="font-label-md text-label-md font-medium text-on-surface">
              Document Classification
            </label>
            <select
              id="upload-type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded text-on-surface focus:outline-none focus:border-secondary"
            >
              {DOCUMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label htmlFor="upload-notes" className="font-label-md text-label-md font-medium text-on-surface">
              Document Description &amp; Auditor Notes (Optional)
            </label>
            <input
              id="upload-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary"
              placeholder="e.g. 2026 batch CoA tested against statutory heavy metal limits"
            />
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 p-2.5 rounded border border-error/30 bg-error-container/40"
          >
            <Icon className="text-[16px] text-error mt-0.5">error</Icon>
            <span className="font-body-sm text-body-sm text-on-error-container">{error}</span>
          </div>
        ) : null}

        <div className="pt-2 border-t border-outline-variant/30 flex items-center justify-between gap-2">
          <span className="font-data-mono text-[11px] text-on-surface-variant flex items-center gap-1">
            <Icon className="text-[13px] text-emerald-600">verified_user</Icon>
            <span>Vault storage is managed by the backend</span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="surface" onClick={onClose} disabled={busy}>
              {phase === "success" ? "Close" : "Cancel"}
            </Button>
            <Button
              variant="primary"
              onClick={upload}
              disabled={!file || busy}
              icon={busy ? undefined : "cloud_upload"}
            >
              {busy ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
