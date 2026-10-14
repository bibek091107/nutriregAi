"use client";

import { useId } from "react";
import type { Product } from "@/lib/api/types";

/**
 * Product scope selector used by the product-scoped routes. It only ever lists
 * products returned by the API and never invents an entry.
 */
export function ProductSelect({
  products,
  value,
  onChange,
  label = "Select a product",
  disabled = false,
  id,
}: {
  products: Product[];
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={selectId} className="sr-only">
        {label}
      </label>
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-8 px-2 rounded bg-surface-container-lowest border border-outline-variant/60 text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary disabled:opacity-50"
      >
        <option value="" disabled>
          {label}
        </option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
    </div>
  );
}
