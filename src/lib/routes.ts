/** Route metadata used to build header breadcrumbs and sidebar active state. */

export interface RouteMeta {
  /** Sidebar label for the matching nav entry. */
  label: string;
  /** Breadcrumb trail rendered in the top bar. */
  breadcrumbs: { label: string; href?: string }[];
}

const PRODUCT_CRUMB = { label: "Products", href: "/products" };
const ROOT_CRUMB = { label: "Formulations", href: "/products" };

export function resolveRouteMeta(pathname: string, productName?: string | null): RouteMeta {
  if (pathname.startsWith("/products/new")) {
    return { label: "Products & Workflows", breadcrumbs: [PRODUCT_CRUMB, { label: "New Product" }] };
  }

  if (/^\/products\/[^/]+/.test(pathname)) {
    return {
      label: "Products & Workflows",
      breadcrumbs: [
        PRODUCT_CRUMB,
        ...(productName ? [{ label: productName }] : []),
        { label: "Regulatory Workflow" },
      ],
    };
  }

  switch (pathname) {
    case "/dashboard":
      return { label: "Dashboard", breadcrumbs: [{ label: "Workspace" }, { label: "Dashboard" }] };
    case "/products":
      return {
        label: "Products & Workflows",
        breadcrumbs: [ROOT_CRUMB, { label: "Formulations Ledger" }],
      };
    case "/ingredients":
      return {
        label: "Ingredients",
        breadcrumbs: [PRODUCT_CRUMB, { label: "Ingredient Analysis" }],
      };
    case "/claims":
      return { label: "Claims Matrix", breadcrumbs: [PRODUCT_CRUMB, { label: "Claims Matrix" }] };
    case "/documents":
      return {
        label: "Document Vault",
        breadcrumbs: [PRODUCT_CRUMB, { label: "Document Vault" }],
      };
    case "/readiness":
      return {
        label: "Regulatory Readiness",
        breadcrumbs: [PRODUCT_CRUMB, { label: "Regulatory Readiness" }],
      };
    case "/compliance":
      return {
        label: "Regulatory Readiness",
        breadcrumbs: [PRODUCT_CRUMB, { label: "Compliance Checklist" }],
      };
    case "/evidence":
      return { label: "Evidence Viewer", breadcrumbs: [PRODUCT_CRUMB, { label: "Evidence Viewer" }] };
    case "/reviews":
      return { label: "Review Queue", breadcrumbs: [PRODUCT_CRUMB, { label: "Review Queue" }] };
    case "/sources":
      return {
        label: "Statutory Sources",
        breadcrumbs: [PRODUCT_CRUMB, { label: "Statutory Sources" }],
      };
    case "/reports":
      return { label: "Audit Reports", breadcrumbs: [PRODUCT_CRUMB, { label: "Audit Reports" }] };
    case "/settings":
      return { label: "Settings", breadcrumbs: [{ label: "Settings" }] };
    default:
      return { label: "Dashboard", breadcrumbs: [{ label: "Workspace" }] };
  }
}

export const MARKET_LABELS: Record<string, string> = {
  INDIA_FSSAI: "India (FSSAI 2026)",
  USA_FDA: "USA (FDA / DSHEA)",
  EU_EFSA: "EU (EFSA 1169)",
  UAE_MOIAT: "UAE (MoIAT / Halal)",
  OTHER: "Other jurisdiction",
};
