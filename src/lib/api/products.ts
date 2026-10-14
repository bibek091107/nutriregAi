/**
 * Product endpoints. No demo data lives in this module — every function either
 * returns backend data or an ApiError the UI renders as a state.
 */

import { apiRequest, uploadWithProgress } from "./client";
import type {
  CreateProductInput,
  DashboardSummary,
  Product,
  ProductIngredient,
  Claim,
  VaultDocument,
  Finding,
  Analysis,
  ComplianceItem,
  ComplianceReport,
} from "./types";

export async function getProducts(
  signal?: AbortSignal,
  query?: { market?: string; stage?: string; risk?: string; search?: string },
): Promise<Product[]> {
  const result = await apiRequest<Product[] | { items: Product[] }>("/api/v1/products", {
    signal,
  });
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getProduct(id: string, signal?: AbortSignal): Promise<Product> {
  return apiRequest<Product>(`/api/v1/products/${encodeURIComponent(id)}`, { signal });
}

export async function createProduct(input: CreateProductInput): Promise<Product> {
  return apiRequest<Product>("/api/v1/products", { method: "POST", body: input });
}

export async function updateProduct(
  id: string,
  input: Partial<CreateProductInput>,
): Promise<Product> {
  return apiRequest<Product>(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function getProductIngredients(
  productId: string,
  signal?: AbortSignal,
): Promise<ProductIngredient[]> {
  const result = await apiRequest<ProductIngredient[] | { items: ProductIngredient[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/ingredients`,
    { signal },
  );  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getProductClaims(
  productId: string,
  signal?: AbortSignal,
): Promise<Claim[]> {
  const result = await apiRequest<Claim[] | { items: Claim[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/claims`,
    { signal },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getProductDocuments(
  productId: string,
  signal?: AbortSignal,
): Promise<VaultDocument[]> {
  const result = await apiRequest<VaultDocument[] | { items: VaultDocument[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/documents`,
    { signal },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getProductFindings(
  productId: string,
  signal?: AbortSignal,
): Promise<Finding[]> {
  const result = await apiRequest<Finding[] | { items: Finding[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/findings`,
    { signal },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getComplianceItems(
  productId: string,
  signal?: AbortSignal,
): Promise<ComplianceItem[]> {
  const result = await apiRequest<ComplianceItem[] | { items: ComplianceItem[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/compliance-items`,
    { signal },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getProductReports(
  productId: string,
  signal?: AbortSignal,
): Promise<ComplianceReport[]> {
  const result = await apiRequest<ComplianceReport[] | { items: ComplianceReport[] }>(
    `/api/v1/products/${encodeURIComponent(productId)}/reports`,
    { signal },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function requestReport(productId: string): Promise<ComplianceReport> {
  return apiRequest<ComplianceReport>(
    `/api/v1/products/${encodeURIComponent(productId)}/reports`,
    { method: "POST" },
  );
}

export async function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>("/api/v1/dashboard/summary", { signal });
}

export async function getRecentFindings(signal?: AbortSignal): Promise<Finding[]> {
  const result = await apiRequest<Finding[] | { items: Finding[] }>("/api/v1/findings", {
    signal,
  });
  return Array.isArray(result) ? result : (result?.items ?? []);
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                    */
/* -------------------------------------------------------------------------- */

export async function startAnalysis(productId: string): Promise<Analysis> {
  return apiRequest<Analysis>(`/api/v1/products/${encodeURIComponent(productId)}/analysis`, {
    method: "POST",
  });
}

export async function getAnalysisStatus(
  productId: string,
  signal?: AbortSignal,
): Promise<Analysis> {
  return apiRequest<Analysis>(
    `/api/v1/products/${encodeURIComponent(productId)}/analysis`,
    { signal },
  );
}

/* -------------------------------------------------------------------------- */
/* Document vault                                                              */
/* -------------------------------------------------------------------------- */

export async function getDocuments(
  signal?: AbortSignal,
  query?: { productId?: string; status?: string },
): Promise<VaultDocument[]> {
  const result = await apiRequest<VaultDocument[] | { items: VaultDocument[] }>(
    "/api/v1/documents",
    { signal, query },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export function uploadDocument(
  file: File,
  fields: { productId?: string; documentType?: string },
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  return uploadWithProgress("/api/v1/documents", file, fields, onProgress, signal);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiRequest<void>(`/api/v1/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
}
