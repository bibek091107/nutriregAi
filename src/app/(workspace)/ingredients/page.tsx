"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import { getProductIngredients } from "@/lib/api/products";
import { ingredientStatusBadge, riskStyle } from "@/lib/presentation";
import { formatDate, humanize, toPercent } from "@/lib/format";
import type { IngredientComplianceStatus, ProductIngredient } from "@/lib/api/types";
import { apiRequest, uploadWithProgress } from "@/lib/api/client";
import { Modal } from "@/components/ui/Modal";

/** Ingredients & Formulation Compliance — product-scoped ledger + inspector. */
export default function IngredientsPage() {
  const { products } = useWorkspace();
  const [productId, setProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | IngredientComplianceStatus>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // Default to the first real product once the workspace list resolves.
  useEffect(() => {
    if (productId === null && products.length > 0) setProductId(products[0].id);
  }, [products, productId]);

  const product = products.find((item) => item.id === productId) ?? null;

  const ingredients = useResource<ProductIngredient[]>(
    (signal) => (productId ? getProductIngredients(productId, signal) : Promise.resolve([])),
    [productId],
    { enabled: Boolean(productId) },
  );

  const all = useMemo(() => ingredients.data ?? [], [ingredients.data]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { ALL: all.length };
    for (const item of all) base[item.status] = (base[item.status] ?? 0) + 1;
    return base;
  }, [all]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        (item.casNumber ?? "").toLowerCase().includes(term)
      );
    });
  }, [all, status, search]);

  const selected = useMemo(
    () => visible.find((item) => item.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const compliant = counts.COMPLIANT ?? 0;
  const reviewRequired = counts.REVIEW_REQUIRED ?? 0;
  const nonCompliant = counts.NON_COMPLIANT ?? 0;
  const highRisk = all.filter((item) => item.riskLevel === "HIGH").length;
  const activeCount = all.filter((item) => item.isActive).length;

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-space-sm mb-space-lg">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md"
          >
            <Link href="/products" className="hover:text-secondary transition-colors">
              Products
            </Link>
            <Icon className="text-[14px]">chevron_right</Icon>
            {product ? (
              <>
                <Link
                  href={`/products/${product.id}`}
                  className="hover:text-secondary transition-colors"
                >
                  {product.name}
                  {product.sku ? ` (${product.sku})` : ""}
                </Link>
                <Icon className="text-[14px]">chevron_right</Icon>
              </>
            ) : null}
            <span className="text-on-surface font-semibold">Ingredients &amp; Formulation</span>
          </nav>
          {product ? (
            <div className="hidden sm:flex items-center gap-space-sm">
              <span className="font-data-mono text-data-mono text-on-surface-variant">
                Last analysis: {formatDate(product.lastAnalysisAt)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pt-space-xs">
          <div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none">
              Ingredients &amp; Formulation Compliance
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1.5">
              {product
                ? `${all.length} Total Ingredients · ${humanize(product.targetMarket ?? "OTHER")} · Compliance status reported by the backend`
                : "Select a product to review its formulation and ingredient compliance."}
            </p>
          </div>
          <div className="flex items-center gap-space-sm shrink-0">
            <div className="flex items-center gap-1.5">
              <label htmlFor="ingredient-product" className="sr-only">
                Select product
              </label>
              <select
                id="ingredient-product"
                value={productId ?? ""}
                onChange={(event) => {
                  setProductId(event.target.value || null);
                  setSelectedId(null);
                }}
                className="h-9 px-space-sm rounded bg-surface-container-lowest border border-outline-variant/60 text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
              >
                <option value="" disabled>
                  Select a product
                </option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.sku ? ` (${item.sku})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              icon="upload_file"
              disabled={!product}
              onClick={() => setImportModalOpen(true)}
              title={product ? "Import a formulation CSV" : "Select a product first"}
            >
              Import Formulation CSV
            </Button>
            <Button
              variant="outline"
              icon="add"
              disabled={!product}
              onClick={() => setAddModalOpen(true)}
              title={product ? "Add an ingredient manually" : "Select a product first"}
            >
              Add Ingredient
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md mb-space-lg">
        {[
          {
            label: "Active Components",
            value: activeCount,
            note: all.length > 0 ? `${toPercent(activeCount, all.length)}% of formulation` : "No formulation data",
            icon: "science",
            iconClass: "text-on-surface-variant",
            valueClass: "text-on-surface",
          },
          {
            label: "Compliant Components",
            value: compliant,
            note: all.length > 0 ? `${toPercent(compliant, all.length)}% of items` : "Reported by the backend",
            icon: "verified",
            iconClass: "text-secondary",
            valueClass: "text-on-surface",
          },
          {
            label: "Review Required",
            value: reviewRequired,
            note: "Backend flagged for human review",
            icon: "pending_actions",
            iconClass: "text-error",
            valueClass: reviewRequired > 0 ? "text-error" : "text-on-surface",
          },
          {
            label: "Direct Statutory Risks",
            value: highRisk,
            note: "Ingredients with high risk",
            icon: "warning",
            iconClass: "text-error",
            valueClass: highRisk > 0 ? "text-error" : "text-on-surface",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface-container-lowest rounded p-space-md shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {card.label}
              </span>
              <Icon className={`text-[18px] ${card.iconClass}`}>{card.icon}</Icon>
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className={`font-headline-lg text-headline-lg font-semibold ${card.valueClass}`}>
                {card.value}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{card.note}</span>
            </div>
          </div>
        ))}
      </div>

      {all.length > 0 ? (
        <div className="bg-surface-container-lowest rounded p-space-sm shadow-sm mb-space-md flex flex-col lg:flex-row items-center justify-between gap-space-sm">
          <div className="relative w-full lg:w-96">
            <label htmlFor="ingredient-search" className="sr-only">
              Filter ingredients
            </label>
            <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </Icon>
            <input
              id="ingredient-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:bg-surface-container-lowest"
              placeholder="Filter by ingredient name, CAS, INS number..."
            />
          </div>
          <div className="flex items-center gap-space-sm w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
            <div className="flex items-center gap-1.5">
              <label htmlFor="ingredient-status" className="font-label-caps text-label-caps text-on-surface-variant uppercase shrink-0">
                Status:
              </label>
              <select
                id="ingredient-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                className="h-8 px-2 text-body-sm font-body-sm rounded bg-surface-container-low text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses ({all.length})</option>
                <option value="COMPLIANT">Compliant ({compliant})</option>
                <option value="REVIEW_REQUIRED">Review Required ({reviewRequired})</option>
                <option value="NON_COMPLIANT">Non Compliant ({nonCompliant})</option>
                <option value="PENDING_ANALYSIS">
                  Pending Analysis ({counts.PENDING_ANALYSIS ?? 0})
                </option>
              </select>
            </div>
            <div className="h-4 w-px bg-surface-container-high mx-1" />
            <span className="font-data-mono text-[11px] text-on-surface-variant">
              {visible.length} of {all.length}
            </span>
          </div>
        </div>
      ) : null}

      {!productId ? (
        <EmptyState
          icon="science"
          title="No product selected"
          description="Ingredients are always evaluated against a specific product formulation. Create a product to begin."
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
          icon="science"
          title="No ingredients added"
          description="Create a product, then add its formulation ingredients to run compliance analysis."
          action={
            <Link href="/products/new">
              <Button variant="primary" icon="add_box">
                Create your first product
              </Button>
            </Link>
          }
        />
      ) : ingredients.status === "loading" ? (
        <LoadingState label="Loading ingredients..." rows={6} />
      ) : ingredients.status === "error" ? (
        <ErrorState
          title="Unable to load ingredients"
          message={ingredients.error.userMessage}
          onRetry={ingredients.refetch}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="science"
          title="No ingredients added"
          description="Add formulation ingredients to evaluate them against the target jurisdiction's requirements."
          action={
            <Button variant="primary" icon="add" disabled={!product} onClick={() => setAddModalOpen(true)}>
              Add Ingredient
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon="filter_alt_off"
          title="No matching ingredients"
          description="No ingredients match the current filters."
          action={
            <Button
              variant="outline"
              icon="restart_alt"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
          <div className="xl:col-span-7 bg-surface-container-lowest rounded shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                    <th className="py-2 px-space-md font-semibold">Ingredient &amp; Code</th>
                    <th className="py-2 px-space-sm font-semibold">Amount</th>
                    <th className="py-2 px-space-sm font-semibold">State</th>
                    <th className="py-2 px-space-sm font-semibold">Regulatory Status</th>
                    <th className="py-2 px-space-sm font-semibold text-center">Risk</th>
                    <th className="py-2 px-space-md font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">
                  {visible.map((item) => {
                    const badge = ingredientStatusBadge(item.status);
                    const isSelected = selected?.id === item.id;
                    const risk = riskStyle(item.riskLevel);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? "bg-secondary/5 font-medium"
                            : "hover:bg-surface-container-low/60"
                        }`}
                      >
                        <td className="py-3 px-space-md">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-8 rounded-full ${
                                isSelected ? "bg-secondary" : "bg-transparent group-hover:bg-outline-variant"
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="truncate">{item.name}</span>
                                {item.status === "PENDING_ANALYSIS" ? (
                                  <Icon className="text-[14px] text-on-surface-variant shrink-0">
                                    hourglass_empty
                                  </Icon>
                                ) : null}
                              </div>
                              <span className="font-data-mono text-[11px] text-on-surface-variant">
                                {item.casNumber ? `CAS: ${item.casNumber}` : item.id}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-space-sm">
                          <div className="font-data-mono font-medium">
                            {item.amountPerServing ?? "—"}
                            {item.amountUnit ? ` ${item.amountUnit}` : ""}
                          </div>
                          <span className="text-[11px] text-on-surface-variant">per serving</span>
                        </td>
                        <td className="py-3 px-space-sm text-on-surface-variant">
                          {item.isActive ? "Active" : "Inactive"}
                        </td>
                        <td className="py-3 px-space-sm">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${
                              item.status === "COMPLIANT"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                : item.status === "REVIEW_REQUIRED"
                                  ? "bg-error-container/40 text-on-error-container border border-error/20"
                                  : item.status === "NON_COMPLIANT"
                                    ? "bg-error-container text-on-error-container border border-error/30"
                                    : "bg-surface-container text-on-surface-variant border border-outline-variant/40"
                            }`}
                          >
                            <Icon className="text-[13px]">{badge.icon}</Icon>
                            {humanize(item.status)}
                          </span>
                        </td>
                        <td className="py-3 px-space-sm text-center">
                          <span
                            className={`font-data-mono text-label-sm font-bold px-1.5 py-0.5 rounded ${risk.className}`}
                          >
                            {risk.label.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-space-md text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(item.id);
                            }}
                            aria-label={`Inspect ${item.name}`}
                            className={`p-1 rounded transition-colors ${
                              isSelected
                                ? "hover:bg-surface-container text-secondary"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                            }`}
                          >
                            <Icon className="text-[18px]">
                              {isSelected ? "visibility" : "chevron_right"}
                            </Icon>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-space-sm bg-surface-container-low/60 flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
              <span>
                Showing {visible.length} of {all.length} ingredients
              </span>
              <span className="font-data-mono">Compliance status is backend-assigned</span>
            </div>
          </div>

          <div className="xl:col-span-5 bg-surface-container-lowest rounded shadow-sm flex flex-col overflow-hidden sticky top-20">
            {selected ? (
              <>
                <div className="p-space-md bg-surface-container-low/80 flex items-start justify-between">
                  <div className="flex flex-col min-w-0 pr-space-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-label-caps text-label-caps uppercase text-secondary font-bold tracking-wider">
                        Active Inspector
                      </span>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        ID: {selected.id}
                      </span>
                    </div>
                    <h2 className="font-headline-lg text-headline-lg text-on-surface mt-1">
                      {selected.name}
                    </h2>
                    <div className="flex items-center gap-space-xs mt-1 text-on-surface-variant font-body-sm text-body-sm">
                      <span>{selected.productName}</span>
                      <span>·</span>
                      <span className="font-data-mono text-data-mono">
                        {selected.casNumber ? `CAS: ${selected.casNumber}` : "CAS not recorded"}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className={`px-space-md py-space-sm flex items-center justify-between ${
                    selected.status === "COMPLIANT"
                      ? "bg-emerald-50/60"
                      : selected.status === "PENDING_ANALYSIS"
                        ? "bg-surface-container-high/40"
                        : "bg-error-container/25"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`text-[20px] ${
                        selected.status === "COMPLIANT"
                          ? "text-emerald-700"
                          : selected.status === "PENDING_ANALYSIS"
                            ? "text-on-surface-variant"
                            : "text-error"
                      }`}
                    >
                      {ingredientStatusBadge(selected.status).icon}
                    </Icon>
                    <div className="flex flex-col">
                      <span
                        className={`font-label-md text-label-md font-semibold leading-tight ${
                          selected.status === "COMPLIANT"
                            ? "text-emerald-800"
                            : selected.status === "PENDING_ANALYSIS"
                              ? "text-on-surface"
                              : "text-error"
                        }`}
                      >
                        {humanize(selected.status)}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {selected.statusNote ?? "Status reported by the regulatory engine"}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`font-data-mono text-data-mono bg-surface-container-lowest px-2 py-0.5 rounded font-bold shadow-sm ${
                      selected.riskLevel === "HIGH" ? "text-error" : "text-secondary"
                    }`}
                  >
                    {riskStyle(selected.riskLevel).label}
                  </span>
                </div>

                <div className="p-space-md space-y-space-md overflow-y-auto">
                  <div className="p-space-md rounded bg-surface-container-low flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-on-surface">
                      <Icon className="text-[16px] text-secondary">science</Icon>
                      <span className="font-label-caps text-label-caps uppercase font-bold tracking-wider">
                        Formulation Detail
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-space-md gap-y-2 font-body-sm text-body-sm">
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Amount Per Serving
                        </span>
                        <span className="text-on-surface font-medium font-data-mono">
                          {selected.amountPerServing ?? "—"}
                          {selected.amountUnit ? ` ${selected.amountUnit}` : ""}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          CAS Number
                        </span>
                        <span className="text-on-surface font-medium font-data-mono text-[12px]">
                          {selected.casNumber ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Formulation State
                        </span>
                        <span className="text-on-surface font-medium">
                          {selected.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Evaluated At
                        </span>
                        <span className="text-on-surface font-medium">
                          {formatDate(selected.evaluatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container-low flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-on-surface">
                      <Icon className="text-[16px] text-secondary">gavel</Icon>
                      <span className="font-label-caps text-label-caps uppercase font-bold tracking-wider">
                        Regulatory Assessment
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface leading-relaxed">
                      {selected.statusNote ??
                        "The regulatory engine has not yet recorded an assessment for this ingredient."}
                    </p>
                    <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
                      Regulatory reasoning, permissible limits, and monograph references are produced by
                      the backend. This panel displays the returned status only.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Link
                      href={`/reviews?product=${selected.productId}`}
                      className="h-8 px-3 bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Icon className="text-[16px] text-secondary">rate_review</Icon>
                      Open in Review Queue
                    </Link>
                    <Link
                      href={`/evidence`}
                      className="h-8 px-3 bg-surface-container-lowest hover:bg-surface-container text-on-surface rounded font-label-md text-label-md flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Icon className="text-[16px] text-secondary">policy</Icon>
                      View Statutory Evidence
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                icon="science"
                title="No ingredient selected"
                description="Select an ingredient to inspect its formulation detail."
              />
            )}
          </div>
        </div>
      )}

      {product && (
        <AddIngredientModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          productId={product.id}
          onSuccess={() => {
            setAddModalOpen(false);
            ingredients.refetch();
          }}
        />
      )}

      {product && (
        <ImportFormulationModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          productId={product.id}
          onSuccess={() => {
            setImportModalOpen(false);
            ingredients.refetch();
          }}
        />
      )}
    </div>
  );
}

function AddIngredientModal({
  open,
  onClose,
  productId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [casNumber, setCasNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(""); setCasNumber(""); setAmount(""); setUnit(""); setPurpose(""); setNotes(""); setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Ingredient name is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/products/${encodeURIComponent(productId)}/ingredients`, {
        method: "POST",
        body: {
          name: name.trim(),
          casNumber: casNumber.trim() || undefined,
          amountPerServing: amount.trim() || undefined,
          amountUnit: unit.trim() || undefined,
          purpose: purpose.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      onSuccess();
    } catch (err: any) {
      setError(err.userMessage || err.message || "Failed to add ingredient.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Ingredient" description="Manually add a formulation ingredient.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-space-md">
        {error && <div className="text-error bg-error-container/30 p-2 rounded text-sm">{error}</div>}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Name *</label>
          <input className="h-9 px-3 rounded bg-surface-container border focus:border-secondary outline-none" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">CAS Number</label>
          <input className="h-9 px-3 rounded bg-surface-container border focus:border-secondary outline-none" value={casNumber} onChange={e => setCasNumber(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Amount Per Serving</label>
            <input type="number" step="any" className="h-9 px-3 rounded bg-surface-container border focus:border-secondary outline-none" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Unit</label>
            <input className="h-9 px-3 rounded bg-surface-container border focus:border-secondary outline-none" value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. mg, g, IU" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Purpose</label>
          <input className="h-9 px-3 rounded bg-surface-container border focus:border-secondary outline-none" value={purpose} onChange={e => setPurpose(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Notes</label>
          <textarea className="p-3 rounded bg-surface-container border focus:border-secondary outline-none" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading}>{loading ? "Saving..." : "Add Ingredient"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportFormulationModal({
  open,
  onClose,
  productId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (open) {
      setFile(null); setError(null); setProgress(0);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const controller = new AbortController();
      await uploadWithProgress(
        `/api/v1/products/${encodeURIComponent(productId)}/ingredients/import`,
        file,
        {},
        setProgress,
        controller.signal
      );
      onSuccess();
    } catch (err: any) {
      setError(err.userMessage || err.message || "Failed to import formulation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Formulation" description="Upload a CSV file containing ingredient formulations.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-space-md">
        {error && <div className="text-error bg-error-container/30 p-2 rounded text-sm">{error}</div>}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">CSV File *</label>
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="h-9" required />
        </div>
        {loading && (
          <div className="w-full bg-surface-container rounded h-2 overflow-hidden mt-2">
            <div className="bg-secondary h-full" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={loading || !file}>{loading ? "Importing..." : "Import"}</Button>
        </div>
      </form>
    </Modal>
  );
}
