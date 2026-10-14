"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Modal } from "@/components/ui/Modal";
import { useResource } from "@/lib/hooks/useResource";
import { useWorkspace } from "@/components/shell/AppShell";
import { createClaim, getClaims } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { claimStatusBadge, riskStyle } from "@/lib/presentation";
import { formatDate, humanize, toPercent } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/routes";
import { downloadCsv, stampedFileName } from "@/lib/export";
import type { Claim, ClaimStatus, ClaimType, Product } from "@/lib/api/types";

const CLAIM_TYPE_OPTIONS: { value: ClaimType; label: string }[] = [
  { value: "NUTRIENT_FUNCTION", label: "Nutrient Function" },
  { value: "HEALTH", label: "Health Claim" },
  { value: "NUTRITIONAL_CONTENT", label: "Nutritional Content" },
  { value: "STRUCTURAL_FUNCTION", label: "Structural Function" },
  { value: "OTHER", label: "Other" },
];

export default function ClaimsPage() {
  const claims = useResource<Claim[]>((signal) => getClaims(signal), []);
  const { products } = useWorkspace();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClaimStatus>("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const all = useMemo(() => claims.data ?? [], [claims.data]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { ALL: all.length };
    for (const claim of all) base[claim.status] = (base[claim.status] ?? 0) + 1;
    return base;
  }, [all]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((claim) => {
      if (statusFilter !== "ALL" && claim.status !== statusFilter) return false;
      if (productFilter !== "ALL" && claim.productId !== productFilter) return false;
      if (!term) return true;
      return (
        claim.text.toLowerCase().includes(term) ||
        claim.productName.toLowerCase().includes(term) ||
        claim.id.toLowerCase().includes(term)
      );
    });
  }, [all, search, statusFilter, productFilter]);

  const selected = useMemo(
    () => visible.find((claim) => claim.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const supported = counts.SUPPORTED ?? 0;
  const pendingAnalysis = counts.PENDING_ANALYSIS ?? 0;
  const highRisk = all.filter((claim) => claim.riskLevel === "HIGH").length;

  const pills: { key: "ALL" | ClaimStatus; label: string }[] = [
    { key: "ALL", label: `All (${counts.ALL ?? 0})` },
    { key: "SUPPORTED", label: `Supported (${supported})` },
    { key: "QUALIFIER_REQUIRED", label: `Needs Evidence (${counts.QUALIFIER_REQUIRED ?? 0})` },
    { key: "NOT_SUPPORTED", label: `Not Supported (${counts.NOT_SUPPORTED ?? 0})` },
    { key: "PENDING_ANALYSIS", label: `Pending (${pendingAnalysis})` },
  ];

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-lg">
        <div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">
            Claims Matrix
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Review product claims, supporting evidence, and regulatory substantiation status across
            target jurisdictions.
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
          <Button
            variant="outline"
            icon="download"
            disabled={visible.length === 0}
            title={
              visible.length === 0
                ? "No claims match the current filters, so there is nothing to export."
                : `Download the ${visible.length} filtered claims as CSV`
            }
            onClick={() =>
              downloadCsv(
                stampedFileName("claims-matrix"),
                visible,
                [
                  { header: "Claim ID", value: (claim) => claim.id },
                  { header: "Claim", value: (claim) => claim.text },
                  { header: "Product", value: (claim) => claim.productName },
                  { header: "Product ID", value: (claim) => claim.productId },
                  { header: "Type", value: (claim) => humanize(claim.claimType) },
                  {
                    header: "Target market",
                    value: (claim) =>
                      claim.targetMarket ? (MARKET_LABELS[claim.targetMarket] ?? claim.targetMarket) : "",
                  },
                  { header: "Status", value: (claim) => humanize(claim.status) },
                  { header: "Risk", value: (claim) => humanize(claim.riskLevel) },
                  { header: "Evidence count", value: (claim) => claim.evidenceCount },
                  { header: "Status note", value: (claim) => claim.statusNote ?? "" },
                  { header: "Disclaimer", value: (claim) => claim.disclaimer ?? "" },
                  { header: "Last reviewed", value: (claim) => formatDate(claim.lastReviewedAt) },
                ],
              )
            }
          >
            Export Matrix
          </Button>
          <Button
            variant="primary"
            icon="add"
            onClick={() => setAddOpen(true)}
            disabled={products.length === 0}
            title={products.length === 0 ? "Create a product first" : undefined}
          >
            Add Claim
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm mb-space-lg">
        {[
          {
            label: "Total Claims",
            value: all.length,
            note: `across ${new Set(all.map((claim) => claim.productId)).size} dossier${
              new Set(all.map((claim) => claim.productId)).size === 1 ? "" : "s"
            }`,
            icon: "featured_play_list",
            iconClass: "text-on-surface-variant",
            valueClass: "text-on-surface",
            chip: null,
          },
          {
            label: "Supported",
            value: supported,
            note: "Substantiated by backend analysis",
            swatch: "bg-[#047857]",
            valueClass: "text-on-surface",
            chip:
              all.length > 0 ? `${toPercent(supported, all.length)}% Compliant` : null,
            chipClass: "text-[#047857] bg-[#ECFDF5] border-[#A7F3D0]",
          },
          {
            label: "Needs Evidence",
            value: counts.QUALIFIER_REQUIRED ?? 0,
            note: "Qualifiers or evidence required",
            swatch: "bg-[#B45309]",
            valueClass: "text-on-surface",
          },
          {
            label: "Review Required",
            value: (counts.NOT_SUPPORTED ?? 0) + (counts.PROHIBITED ?? 0),
            note: "Not supported or prohibited",
            swatch: "bg-[#BE123C]",
            valueClass: "text-error",
            chip: highRisk > 0 ? `${highRisk} High Risk` : null,
            chipClass: "text-error bg-error-container/40 border-error-container",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider">
                {card.label}
              </span>
              {card.icon ? (
                <Icon className={`text-[16px] ${card.iconClass ?? ""}`}>{card.icon}</Icon>
              ) : (
                <span className={`w-2 h-2 rounded-full ${card.swatch}`} />
              )}
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span
                className={`font-headline-lg text-headline-lg font-semibold ${card.valueClass}`}
              >
                {card.value}
              </span>
              {card.chip ? (
                <span
                  className={`font-data-mono text-data-mono px-1.5 py-0.5 rounded border ${card.chipClass ?? ""}`}
                >
                  {card.chip}
                </span>
              ) : (
                <span className="font-body-sm text-body-sm text-on-surface-variant">{card.note}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md mb-space-md space-y-space-sm">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-space-sm">
          <div className="relative flex-1">
            <label htmlFor="claim-search" className="sr-only">
              Search claims
            </label>
            <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </Icon>
            <input
              id="claim-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface border border-outline-variant/60 focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary text-on-surface placeholder:text-on-surface-variant/70"
              placeholder="Search claims, products, or keywords..."
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {pills.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setStatusFilter(pill.key)}
                aria-pressed={statusFilter === pill.key}
                className={`h-7 px-2.5 rounded font-label-sm text-label-sm font-medium shrink-0 transition-colors ${
                  statusFilter === pill.key
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/40"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs border-t border-outline-variant/20">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="claim-product" className="sr-only">
              Filter by product
            </label>
            <select
              id="claim-product"
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="h-7 pl-2 pr-6 text-label-sm font-label-sm rounded bg-surface border border-outline-variant/60 text-on-surface appearance-none focus:outline-none focus:border-secondary"
            >
              <option value="ALL">Product: All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            {all.length > 0 ? (
              <span className="font-data-mono text-[11px] text-on-surface-variant">
                {visible.length} of {all.length} claims
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {claims.status === "loading" ? (
        <LoadingState label="Loading claims..." rows={5} />
      ) : claims.status === "error" ? (
        <ErrorState
          title="Unable to load claims"
          message={claims.error.userMessage}
          onRetry={claims.refetch}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="verified"
          title="No claims added"
          description="Add product claims to evaluate their regulatory requirements."
          action={
            products.length === 0 ? (
              <Link href="/products/new">
                <Button variant="primary" icon="add_box">
                  Create a product first
                </Button>
              </Link>
            ) : (
              <Button variant="primary" icon="add" onClick={() => setAddOpen(true)}>
                Add Claim
              </Button>
            )
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon="filter_alt_off"
          title="No matching claims"
          description="No claims match the current search and filters."
          action={
            <Button
              variant="outline"
              icon="restart_alt"
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setProductFilter("ALL");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
          <div className="xl:col-span-7 bg-surface-container-lowest border border-outline-variant/60 rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/70 border-b border-outline-variant/60 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                    <th className="px-space-sm py-2">Claim &amp; ID</th>
                    <th className="px-space-sm py-2">Product</th>
                    <th className="px-space-sm py-2">Type</th>
                    <th className="px-space-sm py-2">Market</th>
                    <th className="px-space-sm py-2">Regulatory Status</th>
                    <th className="px-space-sm py-2 text-center">Evidence</th>
                    <th className="px-space-sm py-2">Risk</th>
                    <th className="px-space-sm py-2 pr-space-md text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm text-on-surface">
                  {visible.map((claim) => {
                    const status = claimStatusBadge(claim.status);
                    const isSelected = selected?.id === claim.id;
                    return (
                      <tr
                        key={claim.id}
                        onClick={() => setSelectedId(claim.id)}
                        className={`cursor-pointer group transition-colors ${
                          isSelected ? "bg-surface-container-high/50" : "hover:bg-surface-container-low/40"
                        }`}
                      >
                        <td className="px-space-sm py-2.5">
                          <div className="font-medium text-on-surface truncate max-w-[220px]">
                            {claim.text}
                          </div>
                          <div className="font-data-mono text-[11px] text-on-surface-variant">
                            {claim.id}
                          </div>
                        </td>
                        <td className="px-space-sm py-2.5 text-on-surface-variant truncate max-w-[140px]">
                          {claim.productName}
                        </td>
                        <td className="px-space-sm py-2.5 text-on-surface-variant whitespace-nowrap">
                          {humanize(claim.claimType)}
                        </td>
                        <td className="px-space-sm py-2.5 text-on-surface-variant whitespace-nowrap">
                          {claim.targetMarket ? MARKET_LABELS[claim.targetMarket] : "—"}
                        </td>
                        <td className="px-space-sm py-2.5">
                          <Badge tone={status.tone} icon={status.icon}>
                            {humanize(claim.status)}
                          </Badge>
                        </td>
                        <td className="px-space-sm py-2.5 text-center font-data-mono text-[11px]">
                          {claim.evidenceCount}
                        </td>
                        <td className="px-space-sm py-2.5">
                          {claim.riskLevel ? (
                            <span
                              className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider border ${riskStyle(claim.riskLevel).className}`}
                            >
                              {riskStyle(claim.riskLevel).label}
                            </span>
                          ) : (
                            <span className="font-data-mono text-[11px] text-on-surface-variant">—</span>
                          )}
                        </td>
                        <td className="px-space-sm py-2.5 pr-space-md text-right">
                          <Link
                            href={`/evidence?claim=${claim.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="px-2 py-1 rounded text-label-sm font-label-sm text-secondary hover:bg-secondary/10 transition-colors"
                          >
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="xl:col-span-5 bg-surface-container-lowest border border-outline-variant/60 rounded flex flex-col shadow-sm">
            {selected ? (
              <>
                <div className="p-space-md border-b border-outline-variant/40 flex items-start justify-between">
                  <div className="min-w-0 pr-space-sm">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-data-mono text-data-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/50">
                        {selected.id}
                      </span>
                      {selected.claimType ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-medium bg-secondary/10 text-secondary border border-secondary/20">
                          {humanize(selected.claimType)}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">
                      {selected.text}
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      Product: {selected.productName} • Target:{" "}
                      {selected.targetMarket ? MARKET_LABELS[selected.targetMarket] : "Not set"}
                    </p>
                  </div>
                </div>

                <div className="p-space-md space-y-space-md flex-1 text-body-sm font-body-sm">
                  <div className="p-space-sm bg-surface-container-low rounded border border-outline-variant/40 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-on-surface-variant font-label-sm text-label-sm">
                        Regulatory Status:
                      </span>
                      {(() => {
                        const status = claimStatusBadge(selected.status);
                        return (
                          <Badge tone={status.tone} icon={status.icon}>
                            {humanize(selected.status)}
                          </Badge>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-on-surface-variant font-label-sm text-label-sm">Risk:</span>
                      {selected.riskLevel ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${riskStyle(selected.riskLevel).className}`}
                        >
                          {riskStyle(selected.riskLevel).label} Risk
                        </span>
                      ) : (
                        <span className="font-data-mono text-[11px] text-on-surface-variant">
                          Unassessed
                        </span>
                      )}
                    </div>
                  </div>

                  {selected.statusNote ? (
                    <div className="p-space-sm bg-[#FFF1F2] border border-[#FECDD3] rounded text-[#9F1239]">
                      <div className="flex items-start gap-2">
                        <Icon className="text-[18px] shrink-0 mt-0.5">report_problem</Icon>
                        <span className="leading-snug">{selected.statusNote}</span>
                      </div>
                    </div>
                  ) : null}

                  {selected.disclaimer ? (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider">
                          Required Disclaimer
                        </span>
                      </div>
                      <div className="p-space-sm bg-surface-container-low/60 rounded border border-outline-variant/40 font-body-sm text-body-sm text-on-surface">
                        {selected.disclaimer}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant tracking-wider">
                        Supporting Evidence
                      </span>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        {selected.evidenceCount} linked
                      </span>
                    </div>
                    <div className="p-space-sm bg-surface-container-low/60 rounded border border-outline-variant/40 text-on-surface-variant">
                      {selected.evidenceCount === 0 ? (
                        <span>
                          No evidence linked. Evidence is retrieved by the RAG system after an
                          analysis run.
                        </span>
                      ) : (
                        <Link href={`/evidence?claim=${selected.id}`} className="text-secondary hover:underline">
                          Open {selected.evidenceCount} evidence item
                          {selected.evidenceCount === 1 ? "" : "s"} in the Evidence Viewer
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="p-space-sm bg-surface-container rounded border border-outline-variant/50">
                    <div className="font-label-caps text-label-caps uppercase text-on-surface font-semibold mb-1 flex items-center gap-1">
                      <Icon className="text-[15px] text-secondary">schedule</Icon>
                      <span>Last Reviewed</span>
                    </div>
                    <p className="text-on-surface text-body-sm font-body-sm leading-snug">
                      {formatDate(selected.lastReviewedAt)}
                    </p>
                  </div>
                </div>

                <div className="p-space-md border-t border-outline-variant/40 bg-surface-container-low/30 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Link href={`/evidence?claim=${selected.id}`}>
                      <Button variant="primary" icon="folder" className="w-full">
                        Evidence Dossier
                      </Button>
                    </Link>
                    <Button variant="outline" icon="edit" onClick={() => setAddOpen(true)}>
                      Edit Claim Wording
                    </Button>
                  </div>
                  <Link href={`/reviews?product=${selected.productId}`} className="block">
                    <Button variant="outline" icon="verified_user" className="w-full">
                      Send for Regulatory Sign-off
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                icon="fact_check"
                title="No claim selected"
                description="Select a claim to inspect its regulatory status and evidence."
              />
            )}
          </div>
        </div>
      )}

      <AddClaimModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        products={products}
        onCreated={claims.refetch}
      />
    </div>
  );
}

/** Add Claim dialog — posts to the real endpoint, no local mock insert. */
function AddClaimModal({
  open,
  onClose,
  products,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onCreated: () => void;
}) {
  const [text, setText] = useState("");
  const [claimType, setClaimType] = useState<ClaimType>("HEALTH");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    if (text.trim().length < 3) {
      setFieldError("Enter the claim statement text.");
      return;
    }
    if (!productId) {
      setError("Select a product for this claim.");
      return;
    }
    setSubmitting(true);
    try {
      await createClaim(productId, { text: text.trim(), claimType });
      setText("");
      onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.userMessage : "The claim could not be added.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add New Product Claim"
      description="Define claim syntax and attach to an active product formulation."
      labelledBy="add-claim-title"
    >
      <form onSubmit={submit} className="p-space-lg space-y-space-md" noValidate>
        <div>
          <label htmlFor="claim-text" className="block font-label-sm text-label-sm font-medium text-on-surface mb-1">
            Claim Statement Text
          </label>
          <input
            id="claim-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="w-full h-9 px-3 rounded bg-surface border border-outline-variant/60 text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-secondary focus:ring-1 focus:ring-secondary"
            placeholder="e.g. Supports Lean Muscle Mass, 100% Organic..."
            aria-invalid={Boolean(fieldError)}
          />
          {fieldError ? (
            <span role="alert" className="font-label-sm text-label-sm text-error">
              {fieldError}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-space-sm">
          <div>
            <label htmlFor="claim-product-select" className="block font-label-sm text-label-sm font-medium text-on-surface mb-1">
              Product
            </label>
            <select
              id="claim-product-select"
              value={productId || products[0]?.id || ""}
              onChange={(event) => setProductId(event.target.value)}
              className="w-full h-9 px-3 rounded bg-surface border border-outline-variant/60 text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-secondary"
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="claim-type-select" className="block font-label-sm text-label-sm font-medium text-on-surface mb-1">
              Claim Type
            </label>
            <select
              id="claim-type-select"
              value={claimType}
              onChange={(event) => setClaimType(event.target.value as ClaimType)}
              className="w-full h-9 px-3 rounded bg-surface border border-outline-variant/60 text-body-sm font-body-sm text-on-surface focus:outline-none focus:border-secondary"
            >
              {CLAIM_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start gap-2 p-2.5 rounded border border-error/30 bg-error-container/40">
            <Icon className="text-[16px] text-error mt-0.5">error</Icon>
            <span className="font-body-sm text-body-sm text-on-error-container">{error}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-space-sm pt-space-sm border-t border-outline-variant/30">
          <Button variant="surface" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting} icon={submitting ? undefined : "add"}>
            {submitting ? "Adding..." : "Add Claim"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
