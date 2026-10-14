"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ProductSelect } from "@/components/products/ProductSelect";
import { useWorkspace } from "@/components/shell/AppShell";
import { useResource } from "@/lib/hooks/useResource";
import { getComplianceItems, getProduct } from "@/lib/api/products";
import { productStatusBadge } from "@/lib/presentation";
import { humanize, toPercent } from "@/lib/format";
import { MARKET_LABELS } from "@/lib/routes";
import type { ComplianceItem, Product } from "@/lib/api/types";

const CATEGORY_ORDER = [
  "Product Composition",
  "Labelling",
  "Claims & Advertising",
  "Safety Documentation",
  "Process & Records",
];

function CompliancePageContent() {
  const searchParams = useSearchParams();
  const { products, productsError, reloadProducts } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("product"));

  const productId = selectedId ?? products[0]?.id ?? null;

  const product = useResource<Product>(
    (signal) => getProduct(productId as string, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const items = useResource<ComplianceItem[]>(
    (signal) => getComplianceItems(productId as string, signal),
    [productId],
    { enabled: Boolean(productId) },
  );

  const record = product.data;
  const itemList = useMemo(() => items.data ?? [], [items.data]);

  const counts = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let pending = 0;
    for (const item of itemList) {
      if (item.passed === true) passed += 1;
      else if (item.passed === false) failed += 1;
      else pending += 1;
    }
    return { passed, failed, pending, total: itemList.length };
  }, [itemList]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, ComplianceItem[]>();
    for (const item of itemList) {
      const key = item.category ?? "Uncategorised";
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    return [...buckets.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [itemList]);

  const overall = useMemo(() => {
    if (counts.total === 0) {
      return { label: "Not evaluated", icon: "hourglass_empty", className: "text-on-surface-variant bg-surface-container" };
    }
    if (counts.failed > 0) {
      return { label: "Non-compliant", icon: "cancel", className: "text-error bg-error-container" };
    }
    if (counts.pending > 0) {
      return { label: "Incomplete", icon: "pending", className: "text-[#b45309] bg-[#ffb870]/30" };
    }
    return { label: "Compliant", icon: "verified", className: "text-[#046c4e] bg-[#b6f2e0]/40" };
  }, [counts]);

  if (productsError && products.length === 0) {
    return (
      <ErrorState
        title="Unable to load products"
        message="The product list could not be retrieved from the NutriReg API, so a compliance checklist cannot be scoped."
        onRetry={reloadProducts}
      />
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="checklist"
        title="No products available"
        description="Compliance checks are evaluated per product. Create a product to begin."
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
            Compliance Checklist
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1.5 max-w-2xl">
            Item-by-item regulatory status reported by the compliance engine. The checklist is
            read-only and every outcome originates from the backend.
          </p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
          <ProductSelect products={products} value={productId} onChange={setSelectedId} />
          <Button
            variant="outline"
            icon="sync"
            disabled={!productId}
            onClick={() => {
              product.refetch();
              items.refetch();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {product.status === "loading" ? (
        <div className="mt-space-md">
          <LoadingState label="Loading product..." rows={4} />
        </div>
      ) : product.status === "error" ? (
        <div className="mt-space-md">
          <ErrorState
            title="Unable to load product"
            message={product.error.userMessage}
            onRetry={product.refetch}
          />
        </div>
      ) : record ? (
        <div className="mt-space-md flex items-center gap-space-sm flex-wrap">
          <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
            {record.name}
          </span>
          {record.sku ? (
            <span className="font-data-mono text-[11px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface border border-outline-variant/40">
              {record.sku}
            </span>
          ) : null}
          <Badge {...productStatusBadge(record.status)}>{humanize(record.status)}</Badge>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            {record.targetMarket ? MARKET_LABELS[record.targetMarket] : "No target market set"}
          </span>
        </div>
      ) : null}

      {items.status === "loading" ? (
        <div className="mt-space-md">
          <LoadingState label="Loading compliance items..." rows={6} />
        </div>
      ) : items.status === "error" ? (
        <div className="mt-space-md">
          <ErrorState
            title="Unable to load compliance items"
            message={items.error.userMessage}
            onRetry={items.refetch}
          />
        </div>
      ) : itemList.length === 0 ? (
        <div className="mt-space-md">
          <EmptyState
            icon="checklist"
            title="No compliance items reported"
            description={`The backend has not produced a compliance checklist for ${record?.name ?? "this product"} yet. Run a regulatory analysis to generate it.`}
            action={
              <Link href={`/products/${productId}`}>
                <Button variant="primary" icon="play_arrow">
                  Open product workflow
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-space-md grid grid-cols-2 lg:grid-cols-5 gap-space-sm">
            <div className="col-span-2 lg:col-span-1 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md flex flex-col justify-between">
              <div className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Overall Status
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded mt-1 self-start ${overall.className}`}>
                <Icon className="text-[16px]">{overall.icon}</Icon>
                <span className="font-label-md text-label-md font-semibold">{overall.label}</span>
              </div>
            </div>
            {[
              { label: "Checks", value: counts.total, icon: "list_alt", tone: "text-on-surface" },
              { label: "Passing", value: counts.passed, icon: "check_circle", tone: "text-[#046c4e]" },
              { label: "Failing", value: counts.failed, icon: "cancel", tone: "text-error" },
              { label: "Pending", value: counts.pending, icon: "hourglass_top", tone: "text-[#b45309]" },
            ].map((card) => (
              <div
                key={card.label}
                className="bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md"
              >
                <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
                  <span>{card.label}</span>
                  <Icon className="text-[15px] text-secondary">{card.icon}</Icon>
                </div>
                <div className={`font-headline-lg text-headline-lg font-semibold mt-1 ${card.tone}`}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-space-md bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-md text-label-md text-on-surface-variant">
                Completion
              </span>
              <span className="font-data-mono text-[11px] text-on-surface">
                {counts.passed} / {counts.total} checks passed
              </span>
            </div>
            <div className="h-2 w-full bg-surface-container-high rounded overflow-hidden flex">
              <div
                className="h-full bg-[#046c4e]"
                style={{ width: `${toPercent(counts.passed, counts.total)}%` }}
              />
              <div
                className="h-full bg-error"
                style={{ width: `${toPercent(counts.failed, counts.total)}%` }}
              />
            </div>
          </div>

          <div className="mt-space-md flex flex-col gap-space-lg">
            {grouped.map(([category, categoryItems]) => {
              const categoryFailed = categoryItems.filter((item) => item.passed === false).length;
              return (
                <section key={category}>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      {category}
                    </h2>
                    <span className="font-data-mono text-[11px] text-on-surface-variant">
                      {categoryItems.length} checks
                    </span>
                    {categoryFailed > 0 ? (
                      <span className="font-label-sm text-label-sm text-error">
                        {categoryFailed} failing
                      </span>
                    ) : null}
                  </div>
                  <ul className="bg-surface-container-lowest border border-outline-variant/60 rounded divide-y divide-outline-variant/30">
                    {categoryItems.map((item) => {
                      const state =
                        item.passed === true
                          ? { icon: "check_circle", className: "text-[#046c4e]", label: "Pass" }
                          : item.passed === false
                            ? { icon: "cancel", className: "text-error", label: "Fail" }
                            : { icon: "pending", className: "text-[#b45309]", label: "Pending" };
                      return (
                        <li
                          key={item.id}
                          className="flex items-start gap-3 px-space-md py-3"
                        >
                          <Icon className={`text-[18px] mt-0.5 shrink-0 ${state.className}`}>
                            {state.icon}
                          </Icon>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-body-sm text-body-sm font-medium text-on-surface">
                                {item.label}
                              </span>
                              <span
                                className={`font-label-sm text-label-sm font-semibold ${state.className}`}
                              >
                                {state.label}
                              </span>
                            </div>
                            {item.note ? (
                              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                                {item.note}
                              </p>
                            ) : null}
                            <p className="font-data-mono text-[10px] text-on-surface-variant/80 mt-1">
                              {item.id}
                              {item.productId ? ` • ${item.productId}` : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="mt-space-lg flex items-center justify-between flex-wrap gap-space-sm">
            <Link href={`/products/${productId}`}>
              <Button variant="outline" icon="arrow_back">
                Back to product workflow
              </Button>
            </Link>
            <Link href={`/readiness?product=${productId}`}>
              <Button variant="primary" icon="gshield">
                Regulatory readiness
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function CompliancePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading compliance checklist..." rows={6} />}>
      <CompliancePageContent />
    </Suspense>
  );
}
