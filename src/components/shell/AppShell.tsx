"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { SessionProvider } from "@/lib/auth/session";
import { useResource } from "@/lib/hooks/useResource";
import { getProducts } from "@/lib/api/products";
import { resolveRouteMeta } from "@/lib/routes";
import type { Product } from "@/lib/api/types";

const WorkspaceContext = createContext<{
  products: Product[];
  productsError: boolean;
  reloadProducts: () => void;
}>({ products: [], productsError: false, reloadProducts: () => {} });

export const useWorkspace = () => useContext(WorkspaceContext);

/**
 * Application shell: fixed sidebar, fixed top bar, and the routed content canvas.
 * The product list is loaded once here so the sidebar's "Active Product" picker
 * stays consistent across routes.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const productsResource = useResource<Product[]>((signal) => getProducts(signal), []);

  const products = useMemo(() => productsResource.data ?? [], [productsResource.data]);
  const workspaceValue = useMemo(
    () => ({
      products,
      productsError: productsResource.status === "error",
      reloadProducts: productsResource.refetch,
    }),
    [products, productsResource.status, productsResource.refetch],
  );

  const productIdMatch = pathname.match(/^\/products\/([^/]+)/);
  const activeProduct = productIdMatch
    ? products.find((product) => product.id === productIdMatch[1])
    : null;

  const meta = resolveRouteMeta(pathname, activeProduct?.name ?? null);

  return (
    <SessionProvider>
      <WorkspaceContext.Provider value={workspaceValue}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:rounded focus:bg-secondary focus:text-on-secondary"
        >
          Skip to main content
        </a>
        <Sidebar products={products} activeProductId={activeProduct?.id ?? null} />
        <TopHeader
          breadcrumbs={meta.breadcrumbs}
          targetMarket={activeProduct ? (activeProduct.targetMarket ?? null) : null}
        />
        <main
          id="main-content"
          className="w-full ml-60 pt-14 px-space-lg py-space-lg bg-surface min-h-screen"
        >
          {children}
        </main>
      </WorkspaceContext.Provider>
    </SessionProvider>
  );
}
