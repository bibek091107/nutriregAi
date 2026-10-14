"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { createProduct } from "@/lib/api/products";
import { ApiError } from "@/lib/api/client";
import type { CreateProductInput, ProductCategory, TargetMarket } from "@/lib/api/types";

export const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: "FUNCTIONAL_FOOD", label: "Functional Food & Nutraceutical" },
  { value: "FUNCTIONAL_BEVERAGE", label: "Functional Beverage / Ready-to-Drink" },
  { value: "DIETARY_SUPPLEMENT", label: "Dietary Supplement (Capsule / Tablet)" },
  { value: "SPORTS_NUTRITION", label: "Sports Nutrition / Protein Isolates" },
  { value: "FORTIFIED_CEREAL", label: "Fortified Cereal & Bakery" },
  { value: "OTHER", label: "Other" },
];

export const MARKET_OPTIONS: { value: TargetMarket; label: string; sub: string }[] = [
  { value: "INDIA_FSSAI", label: "India (FSSAI 2026)", sub: "Gazette Compendium" },
  { value: "USA_FDA", label: "USA (FDA / DSHEA)", sub: "21 CFR Part 111" },
  { value: "EU_EFSA", label: "EU (EFSA 1169)", sub: "Harmonised Directive" },
  { value: "UAE_MOIAT", label: "UAE (MoIAT / Halal)", sub: "GSO 2055-1" },
  { value: "OTHER", label: "Other jurisdiction", sub: "Configure later" },
];

const FIELD_CLASS =
  "h-9 px-3 text-body-sm font-body-sm rounded bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none transition-all";

/**
 * Shared product creation form used by both the Create New Product dialog and
 * the dedicated /products/new route. It POSTs to the real endpoint and routes
 * to the new product's workflow page; no local product is ever fabricated.
 */
export function ProductForm({
  onCreated,
  onCancel,
  submitLabel = "Continue to Ingredients",
  showCancel = true,
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
  submitLabel?: string;
  showCancel?: boolean;
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("FUNCTIONAL_FOOD");
  const [market, setMarket] = useState<TargetMarket>("INDIA_FSSAI");
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName("");
    setCategory("FUNCTIONAL_FOOD");
    setMarket("INDIA_FSSAI");
    setSku("");
    setDescription("");
    setFormError(null);
    setFieldErrors({});
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Enter a product name of at least 2 characters.";
    if (name.length > 160) errors.name = "Product name must be 160 characters or fewer.";
    if (sku.length > 64) errors.sku = "SKU must be 64 characters or fewer.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    const payload: CreateProductInput = {
      name: name.trim(),
      category,
      targetMarket: market,
    };
    if (sku.trim()) payload.sku = sku.trim();
    if (description.trim()) payload.description = description.trim();

    setSubmitting(true);
    try {
      const created = await createProduct(payload);
      reset();
      onCreated?.(created.id);
      router.push(`/products/${created.id}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.userMessage
          : "The product could not be created. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-space-md" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="product-name" className="font-label-md text-label-md text-on-surface font-medium">
          Product Name
        </label>
        <input
          id="product-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD_CLASS}
          placeholder="e.g. Apex Bio-Active Whey"
          required
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "product-name-error" : undefined}
        />
        {fieldErrors.name ? (
          <span id="product-name-error" role="alert" className="font-label-sm text-label-sm text-error">
            {fieldErrors.name}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-category" className="font-label-md text-label-md text-on-surface font-medium">
          Product Category
        </label>
        <select
          id="product-category"
          value={category}
          onChange={(event) => setCategory(event.target.value as ProductCategory)}
          className={`${FIELD_CLASS} cursor-pointer`}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="font-label-md text-label-md text-on-surface font-medium">
          Primary Target Market
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {MARKET_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                market === option.value
                  ? "bg-surface-container-high text-on-surface text-body-sm"
                  : "bg-surface-container-low text-on-surface text-body-sm"
              }`}
            >
              <input
                type="radio"
                name="target_market"
                value={option.value}
                checked={market === option.value}
                onChange={() => setMarket(option.value)}
                className="accent-secondary"
              />
              <span className="flex flex-col min-w-0">
                <span className="font-medium">{option.label}</span>
                <span className="font-data-mono text-[10px] text-on-surface-variant">{option.sub}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-sku" className="font-label-md text-label-md text-on-surface font-medium">
          Internal Formula ID / SKU{" "}
          <span className="text-on-surface-variant font-normal">(Optional)</span>
        </label>
        <input
          id="product-sku"
          value={sku}
          onChange={(event) => setSku(event.target.value)}
          className={`${FIELD_CLASS} font-data-mono text-data-mono`}
          placeholder="e.g. SKU-IND-802"
          aria-invalid={Boolean(fieldErrors.sku)}
          aria-describedby={fieldErrors.sku ? "product-sku-error" : undefined}
        />
        {fieldErrors.sku ? (
          <span id="product-sku-error" role="alert" className="font-label-sm text-label-sm text-error">
            {fieldErrors.sku}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="product-description" className="font-label-md text-label-md text-on-surface font-medium">
          Description <span className="text-on-surface-variant font-normal">(Optional)</span>
        </label>
        <textarea
          id="product-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          className="px-3 py-2 text-body-sm font-body-sm rounded bg-surface-container-low focus:bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none transition-all"
          placeholder="Describe the formulation, intended use, and packaging."
        />
        <p className="font-body-sm text-[11px] text-on-surface-variant">
          Ingredients, claims, and documents are attached to the dossier after creation from the
          product workflow.
        </p>
      </div>

      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 p-2.5 rounded border border-error/30 bg-error-container/40"
        >
          <Icon className="text-[16px] text-error mt-0.5">error</Icon>
          <span className="font-body-sm text-body-sm text-on-error-container">{formError}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-space-sm pt-space-sm border-t border-surface-container-low">
        {showCancel ? (
          <button
            type="button"
            onClick={() => {
              reset();
              onCancel?.();
            }}
            disabled={submitting}
            className="h-9 px-space-md rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="h-9 px-space-md rounded bg-secondary hover:bg-secondary-container text-on-secondary font-label-md text-label-md flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
        >
          {submitting ? (
            <Icon className="text-[16px] animate-spin">progress_activity</Icon>
          ) : (
            <Icon className="text-[16px]">arrow_forward</Icon>
          )}
          <span>{submitting ? "Creating..." : submitLabel}</span>
        </button>
      </div>
    </form>
  );
}
