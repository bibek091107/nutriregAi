import { apiRequest } from "./client";
import type { Claim, Evidence, ReviewDecisionInput, ReviewTask, StatutorySource } from "./types";

/* ---------------------------------- Claims --------------------------------- */

export async function getClaims(
  signal?: AbortSignal,
  query?: { productId?: string; status?: string; market?: string },
): Promise<Claim[]> {
  const result = await apiRequest<Claim[] | { items: Claim[] }>("/api/v1/claims", {
    signal,
    query,
  });
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function createClaim(
  productId: string,
  input: { text: string; claimType?: string; targetMarket?: string },
): Promise<Claim> {
  return apiRequest<Claim>(`/api/v1/products/${encodeURIComponent(productId)}/claims`, {
    method: "POST",
    body: input,
  });
}

/* --------------------------------- Evidence -------------------------------- */

export async function getEvidence(
  signal?: AbortSignal,
  query?: { findingId?: string; productId?: string },
): Promise<Evidence[]> {
  const result = await apiRequest<Evidence[] | { items: Evidence[] }>("/api/v1/evidence", {
    signal,
    query,
  });
  return Array.isArray(result) ? result : (result?.items ?? []);
}

/* ------------------------------- Review queue ------------------------------ */

export async function getReviewQueue(
  signal?: AbortSignal,
  query?: { status?: string; severity?: string },
): Promise<ReviewTask[]> {
  const result = await apiRequest<ReviewTask[] | { items: ReviewTask[] }>("/api/v1/reviews", {
    signal,
    query,
  });
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function submitReviewDecision(
  reviewId: string,
  input: ReviewDecisionInput,
): Promise<ReviewTask> {
  return apiRequest<ReviewTask>(`/api/v1/reviews/${encodeURIComponent(reviewId)}/decision`, {
    method: "POST",
    body: input,
  });
}

/* ---------------------------- Statutory sources ----------------------------- */

export async function getStatutorySources(
  signal?: AbortSignal,
  query?: { authority?: string; jurisdiction?: string; search?: string },
): Promise<StatutorySource[]> {
  const result = await apiRequest<StatutorySource[] | { items: StatutorySource[] }>(
    "/api/v1/statutory-sources",
    { signal, query },
  );
  return Array.isArray(result) ? result : (result?.items ?? []);
}

export async function getStatutorySource(
  id: string,
  signal?: AbortSignal,
): Promise<StatutorySource> {
  return apiRequest<StatutorySource>(`/api/v1/statutory-sources/${encodeURIComponent(id)}`, {
    signal,
  });
}
