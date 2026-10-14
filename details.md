# NutriReg AI — Backend Contract Required by the Frontend

This document specifies exactly what the FastAPI backend must do for the existing
NutriReg AI frontend to work. It is derived from the frontend source of truth and
describes **only** what the client actually sends, expects, and renders.

**No backend code exists yet. This is a specification, not an implementation.**

| Source of truth | Path |
| --- | --- |
| Transport | `src/lib/api/client.ts` |
| Domain models | `src/lib/api/types.ts` |
| Product/document/analysis services | `src/lib/api/products.ts` |
| Claim/evidence/review/source services | `src/lib/api/index.ts` |
| Async state machine | `src/lib/hooks/useResource.ts` |
| Session | `src/lib/auth/session.tsx` |

---

## 1. Connection and global transport rules

### 1.1 Base URL

The frontend reads one variable:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

It is baked in at build time (`process.env.NEXT_PUBLIC_API_URL`), trailing slashes are
stripped, and it may be **empty**. When empty, every request fails immediately with
`ApiError("not-configured")` and no network call is made. The UI then renders its
"Backend unavailable" state. This is expected behaviour, not an error condition.

All paths below are relative to this base URL. IDs are URL-encoded by the client, so
IDs may safely contain characters such as `/`, `:`, or spaces — though UUIDs are
recommended.

### 1.2 Request headers

The client sends:

| Condition | Headers |
| --- | --- |
| Any request | `cache: no-store` (browser-level, no header) |
| JSON body (`POST`/`PATCH` with a body) | `Content-Type: application/json` |
| Multipart upload | **No `Content-Type` header** — the browser must set the boundary |
| All other requests | No explicit headers |

The client sends **no `Authorization` header and no credentials option**. Authentication
is entirely backend-owned (cookie-based session). If the backend requires bearer tokens,
the frontend must be changed — so prefer a `HttpOnly` cookie session, or add permissive
CORS with `credentials: "include"` and update `client.ts` accordingly.

### 1.3 Response handling

`apiRequest` classifies every response as follows. The backend only needs to return
correct status codes; the client does the classification.

| Status | Treated as | Operator-facing message |
| --- | --- | --- |
| `404` | `ApiError("not-found")` | "The requested record no longer exists." |
| `>= 500` | `ApiError("server")` | "The NutriReg API returned an error. Try again in a moment." |
| `400`, `401`, `403`, `409`, `422`, any other non-2xx | `ApiError("client")` | "The request was rejected. Check the submitted values and try again." |
| `204 No Content` | Resolves to `undefined` | — |
| `2xx` with body | Parsed as JSON | — |
| `2xx` with malformed body | `ApiError("parse")` | "The NutriReg API returned an unexpected response." |
| Network failure / CORS rejection | `ApiError("network")` | "Backend unavailable. The NutriReg API could not be reached." |

Important consequences for backend behaviour:

1. **`4xx` codes are never shown verbatim.** For `422` validation errors the client shows
   a generic rejection message. The backend's `detail` array is *not* surfaced. If
   field-level validation messaging is ever wanted, the frontend must change.
2. **Distinguish 404 from other 4xx.** A `404` produces a different message and, on the
   product detail page, a "Product not found" empty state. Returning `404` for missing
   products is meaningful; returning `400` is not.
3. **Always return valid JSON for 2xx** (except intentional `204`).
4. **Never return a `2xx` with an error payload.** There is no envelope handling — the
   raw body is cast straight to the target type.

### 1.4 List envelope

Every collection endpoint must return **either**:

- a bare JSON array — `[ {...}, {...} ]`, **or**
- an object with an `items` array — `{ "items": [ {...} ] }`

Both are accepted; the service layer normalises them. A bare array is the simplest
option. Pagination envelopes (`{data, total, page}`) are **not** supported — the
frontend would render `undefined` and the tables would break.

### 1.5 Query parameters

Empty-string, `null`, and `undefined` query values are **omitted** from the URL. Query
parameters are only used as a client-side optimisation; the frontend already fetches the
full collection and filters in memory. See §12 for the full set.

---

## 2. Enumerations

The backend must return these exact uppercase tokens. Any unknown token will make the
frontend throw (`Cannot read properties of undefined` when indexing a status map), which
surfaces as a client-side crash rather than a friendly state.

### 2.1 `ProductCategory`
`FUNCTIONAL_FOOD` · `FUNCTIONAL_BEVERAGE` · `DIETARY_SUPPLEMENT` · `SPORTS_NUTRITION` ·
`FORTIFIED_CEREAL` · `OTHER`

### 2.2 `TargetMarket`
`INDIA_FSSAI` · `USA_FDA` · `EU_EFSA` · `UAE_MOIAT` · `OTHER`

### 2.3 `ProductStatus`
`DRAFT` · `NOT_STARTED` · `IN_PROGRESS` · `REVIEW_REQUIRED` · `NEEDS_ATTENTION` · `COMPLETED`

### 2.4 `WorkflowStageKey` — the nine-stage workflow
The backend owns stage order and completion. The frontend renders whatever array it
receives, in array order, and computes "N / M Completed" from it.

`product_setup` · `ingredients` · `claims` · `documents` · `regulatory_analysis` ·
`risk_review` · `compliance_checklist` · `human_review` · `report`

### 2.5 `StageState`
`PENDING` · `ACTIVE` · `COMPLETED`

### 2.6 `IngredientComplianceStatus`
`PENDING_ANALYSIS` · `COMPLIANT` · `REVIEW_REQUIRED` · `NON_COMPLIANT`

### 2.7 `ClaimType`
`NUTRIENT_FUNCTION` · `HEALTH` · `NUTRITIONAL_CONTENT` · `STRUCTURAL_FUNCTION` · `OTHER`

### 2.8 `ClaimStatus`
`PENDING_ANALYSIS` · `SUPPORTED` · `QUALIFIER_REQUIRED` · `NOT_SUPPORTED` · `PROHIBITED`

### 2.9 `DocumentType`
`PRODUCT_SPEC` · `CERTIFICATE_OF_ANALYSIS` · `LAB_REPORT` · `SAFETY_SHEET` ·
`LABEL_ARTWORK` · `OTHER`

### 2.10 `DocumentStatus`
`UPLOADING` · `UPLOADED` · `PROCESSING` · `PROCESSED` · `FAILED`

The lifecycle: `UPLOADED` → `PROCESSING` → `PROCESSED` | `FAILED`. `UPLOADING` is a
transient client-side state and should not be persisted.

### 2.11 `extractionStatus` (on documents)
`PENDING` · `RUNNING` · `COMPLETE` · `FAILED` — or `null`

Note this is a **separate** axis from `status`: a document can be `PROCESSED` with
`extractionStatus: "FAILED"`. Both are rendered in different table columns.

### 2.12 `AnalysisStatus`
`NOT_STARTED` · `QUEUED` · `PROCESSING` · `COMPLETED` · `FAILED`

The frontend treats `QUEUED` and `PROCESSING` as "running" and renders a progress
state. `FAILED` renders the `failureReason` string in an error banner.

### 2.13 `FindingSeverity`
`HIGH` · `MEDIUM` · `LOW`

There is **no `CRITICAL`** value. A 4th tier is not modelled.

### 2.14 `FindingStatus`
`OPEN` · `IN_PROGRESS` · `RESOLVED` · `UNRESOLVED`

The product detail page treats anything other than `RESOLVED` as requiring action.

### 2.15 `EvidenceStatus`
`PENDING` · `RELEVANT` · `PARTIALLY_RELEVANT` · `NOT_RELEVANT`

### 2.16 `ReviewDecision` (request payload)
`APPROVE` · `REJECT` · `REQUEST_MORE_EVIDENCE` · `ESCALATE`

### 2.17 `ReviewTaskStatus`
`PENDING` · `IN_REVIEW` · `APPROVED` · `REJECTED` · `ESCALATED` · `CANCELLED`

### 2.18 `ReportStatus`
`PENDING` · `GENERATING` · `READY` · `FAILED`

### 2.19 `sourceType` (statutory sources)
`ACT` · `REGULATION` · `GUIDANCE` · `STANDARD` · `NOTIFICATION` — or `null`

### 2.20 Risk levels
Used by claims and ingredients: `NONE` · `LOW` · `MEDIUM` · `HIGH` — or `null`

`NONE` is a real, distinct value meaning "no risk", and the frontend colours it
differently from `LOW`. Do not normalise `NONE` to `LOW`.

---

## 3. Authentication and session

### 3.1 `GET /api/v1/auth/session`

Called **once on every page load**, from `SessionProvider`, before anything else renders.

- **200 with a `SessionUser` object** → the app is `authenticated`. The sidebar shows
  the user's name, role, and initials.
- **404 or any 4xx/5xx** → the app is `anonymous`. The sidebar shows "Not signed in"
  and a neutral person icon.

There is no third option and no error UI for this call — failure is always treated as
"anonymous". The backend does not need a session endpoint to exist.

**Response shape (`SessionUser`):**
```json
{
  "id": "string",
  "displayName": "string",
  "email": "string | null",
  "organizationName": "string | null",
  "role": "string | null"
}
```

`displayName` is the only field the UI depends on; it must be non-empty or the avatar
shows no initials.

### 3.2 `POST /api/v1/auth/logout`

Fire-and-forget. The frontend calls it, ignores the response, and immediately resets to
`anonymous` regardless of the outcome. `204` is appropriate.

### 3.3 Review attribution

The frontend **never** sends a reviewer identity. `submitReviewDecision` posts only the
decision and an optional note. The backend must attribute the decision from the session
(cookie), not from a client-supplied user ID. `ReviewTask.assigneeId` / `assigneeName` are
read-only from the client's perspective.

---

## 4. Dashboard

### `GET /api/v1/dashboard/summary`

**Must return a flat object, not an envelope.** This is the one endpoint where the
`items` fallback is not applied, so `{ "items": {...} }` will break it.

```json
{
  "productCount": 0,
  "activeAnalysisCount": 0,
  "highRiskCount": 0,
  "pendingReviewCount": 0,
  "readiness": { "ready": 0, "reviewRequired": 0, "missingInformation": 0 }
}
```

Semantics:
- `productCount` — all products, no scoping.
- `activeAnalysisCount` — analyses in `QUEUED` or `PROCESSING`. Must reach 0 when idle,
  otherwise the dashboard permanently shows a spinner.
- `highRiskCount` — count of findings with `severity: "HIGH"` and a non-`RESOLVED` status.
- `pendingReviewCount` — review tasks in `PENDING` or `IN_REVIEW`.
- `readiness.ready` / `reviewRequired` / `missingInformation` — mutually exclusive
  product counts that should sum to `productCount`.

All zeros are a valid, meaningful response for a new workspace.

### `GET /api/v1/findings`

Returns recent findings across all products (the dashboard "recent activity" list). Same
array/`items` rule as §1.4. Each element is a `Finding` (§9.1) **including `productId`
and `productName`** — the dashboard links each row to
`/readiness?product={productId}`, so both fields must be present on cross-product
queries.

---

## 5. Products

### 5.1 `GET /api/v1/products`

Returns all products. No server-side filtering is required; the frontend filters by
status, market, risk, and text in memory. Returns an `array` or `{ items: array }`.

**`Product` object — all fields required unless marked nullable:**

```json
{
  "id": "string",
  "name": "string",
  "sku": "string | null",
  "category": "ProductCategory | null",
  "targetMarket": "TargetMarket | null",
  "description": "string | null",
  "status": "ProductStatus",
  "stages": [ /* WorkflowStage, see below */ ],
  "risks": { "high": 0, "medium": 0, "low": 0 },
  "claimCount": 0,
  "documentCount": 0,
  "ingredientCount": 0,
  "findingCount": 0,
  "lastAnalysisAt": "ISO-8601 string | null",
  "createdAt": "ISO-8601 string | null"
}
```

`WorkflowStage`:
```json
{ "key": "WorkflowStageKey", "label": "string", "state": "StageState", "completedAt": "ISO-8601 | null" }
```

The `risks` sub-object must always contain all three integers, even when zero. The
products page risk-distribution bar divides by their sum, so a missing key yields
`NaN%` width.

**The backend must always return the full nine-stage array in order**, even for a
brand-new `DRAFT` product (all `PENDING`). An empty `stages` array renders the message
"Workflow stages are reported by the backend once a product dossier exists", which reads
as a backend fault. For a product that has never been analysed, expect
`product_setup: COMPLETED` and the rest `PENDING` with `documents: ACTIVE` once
documents exist.

### 5.2 `GET /api/v1/products/{id}`

Returns a single `Product` as above. **Must return `404` for an unknown ID** so the
detail page shows its designed "Product not found" state instead of an error banner.

### 5.3 `POST /api/v1/products`

Request body (`CreateProductInput`):
```json
{
  "name": "string",              // required, trimmed, 2-160 chars
  "category": "ProductCategory",  // required
  "targetMarket": "TargetMarket",// required
  "description": "string",       // optional
  "sku": "string"                // optional
}
```

Client-side validation already enforces: name 2–160 chars, SKU ≤ 64 chars. Optional
fields are **omitted entirely** when blank, not sent as empty strings.

**Response: the full `Product` object (§5.1).** The frontend immediately navigates to
`/products/{id}`, so the response must contain a valid `id`. Returning a bare
`{ "id": "..." }` will render a broken page.

Suggested initial server state: `status: "DRAFT"`, all counts `0`, empty `risks`,
`lastAnalysisAt: null`, and the nine stages with `product_setup: COMPLETED`.

### 5.4 `PATCH /api/v1/products/{id}`

**Implemented in the client but currently called by no UI.** The service exists in
`src/lib/api/products.ts` as `updateProduct`, accepting a partial `CreateProductInput`
and expecting a full `Product` back. Either implement it or delete the client function
— an unused endpoint is worse than none.

---

## 6. Ingredients

### `GET /api/v1/products/{product_id}/ingredients`

Returns `ProductIngredient` objects. `ProductIngredient`:
```json
{
  "id": "string",
  "productId": "string",
  "productName": "string",
  "name": "string",
  "casNumber": "string | null",
  "amountPerServing": "number | null",
  "amountUnit": "string | null",
  "isActive": true,
  "status": "IngredientComplianceStatus",
  "riskLevel": "NONE | LOW | MEDIUM | HIGH | null",
  "statusNote": "string | null",
  "evaluatedAt": "ISO-8601 | null"
}
```

Returning `[]` is the normal case: the frontend has no ingredient-creation UI (see
§13) and ingredients are expected to arrive from document extraction.

**There is no `POST /ingredients` endpoint in the contract.** The "Add Ingredient"
button is permanently disabled and states this in its tooltip.

---

## 7. Claims

### 7.1 `GET /api/v1/claims`

Returns `Claim` objects across all products. Supports optional `productId`, `status`,
`market` query params (client-side filtering is used regardless).

`Claim`:
```json
{
  "id": "string",
  "productId": "string",
  "productName": "string",
  "text": "string",
  "claimType": "ClaimType | null",
  "targetMarket": "TargetMarket | null",
  "status": "ClaimStatus",
  "riskLevel": "NONE | LOW | MEDIUM | HIGH | null",
  "disclaimer": "string | null",
  "statusNote": "string | null",
  "evidenceCount": 0,
  "lastReviewedAt": "ISO-8601 | null"
}
```

`evidenceCount` is a **number, not an array** — it is rendered directly in the claims
table and in the CSV export.

`statusNote` is the rationale shown in the claim detail drawer. When a claim is
`QUALIFIER_REQUIRED` or `NOT_SUPPORTED`, populate it with the reason.

### 7.2 `POST /api/v1/products/{product_id}/claims`

Request body:
```json
{ "text": "string", "claimType": "ClaimType" }
```

`text` is trimmed client-side and must be ≥ 3 chars. `claimType` is always sent (defaults
to `HEALTH`). `targetMarket` is **never sent by the client** — the backend must
default it to the parent product's `targetMarket` when the claim is created.

**Response: the full created `Claim`.**

The new claim is created with `status: "PENDING_ANALYSIS"` and `riskLevel: null` until
the analysis engine evaluates it. Do not compute a status at insert time.

---

## 8. Documents

### 8.1 `GET /api/v1/documents`

Returns documents across all products. Optional `productId` and `status` query params.

`VaultDocument`:
```json
{
  "id": "string",
  "productId": "string | null",
  "productName": "string | null",
  "fileName": "string",
  "documentType": "DocumentType | null",
  "sizeBytes": 26214400,
  "status": "DocumentStatus",
  "extractionStatus": "PENDING | RUNNING | COMPLETE | FAILED | null",
  "uploadedAt": "ISO-8601 | null",
  "failureReason": "string | null"
}
```

`sizeBytes` is the **raw byte count** (not MB) — the client formats it. `fileName` is
displayed verbatim, so return the original client filename.

When `status` is `FAILED`, populate `failureReason`; it is rendered in the failure
summary. On success, return it as `null`.

### 8.2 `GET /api/v1/products/{product_id}/documents`

Same `VaultDocument` shape, scoped to one product. Used by the product detail tab.

### 8.3 `POST /api/v1/documents` — multipart upload

Sent via `XMLHttpRequest` to report real upload progress. **Do not set
`Content-Type`** — let the framework generate the multipart boundary.

Multipart fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | binary | **yes** | Field name must be exactly `file` |
| `documentType` | string | **yes** | Always sent; one of §2.9 |
| `productId` | string | no | **Omitted entirely** when no product is selected |
| `notes` | string | no | Free text; omitted when blank |

`productId` may be **absent** for unfiled documents. The backend must accept a
document with no product association and return `productId: null` — the vault renders
these as "Unfiled".

**Client-side limits already enforced** (the backend should re-validate anyway):

| Constraint | Value |
| --- | --- |
| Max size | 25 MB (26214400 bytes) |
| Extensions | `.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`, `.jpeg` |
| MIME types | `application/pdf`, `…wordprocessingml.document`, `…spreadsheetml.sheet`, `image/png`, `image/jpeg` |

A file is accepted if **either** the extension **or** the MIME type matches. Reject
anything else with `4xx` and an empty `sizeBytes: 0` file with `4xx`.

**Response: the created `VaultDocument`** (or any `2xx` JSON — the client parses it but
discards it and refetches).

#### Upload lifecycle and polling

This is the most important behavioural requirement in the document.

1. The upload request returns **as soon as the bytes are stored**, with
   `status: "UPLOADED"` and `extractionStatus: "PENDING"`.
2. The frontend polls `GET /api/v1/documents` every **4000 ms** while any document is in
   an active status (`UPLOADING`, `UPLOADED`, `PROCESSING`). It stops polling once
   nothing is active.
3. The backend must move documents through the lifecycle **asynchronously**:

```
UPLOADED ──► PROCESSING ──► PROCESSED
                        └──► FAILED   (failureReason populated)
```

   `extractionStatus` advances in parallel: `PENDING` → `RUNNING` → `COMPLETE` | `FAILED`.

4. **Do not block the response on extraction.** A synchronous parse will hit the
   4000 ms poll cycle as a timeout and then as a `5xx`.
5. Extraction must be resilient: a single unparseable file becomes `FAILED` with a
   reason, never a server error.

### 8.4 `DELETE /api/v1/documents/{id}`

**Implemented in the client but currently called by no UI** (see §5.4). `204` is
expected. If a document is referenced by findings, prefer `409`.

---

## 9. Analysis and findings

### 9.1 `POST /api/v1/products/{product_id}/analysis`

Starts an analysis. **No request body.** Must be idempotent: if an analysis is already
`QUEUED` or `PROCESSING` for the product, return that analysis rather than creating a
second one. The frontend disables the button while running, but the endpoint must be
safe under double-submit.

**Response: the `Analysis` object.**

```json
{
  "id": "string",
  "productId": "string",
  "status": "AnalysisStatus",
  "progress": 0,
  "startedAt": "ISO-8601 | null",
  "completedAt": "ISO-8601 | null",
  "failureReason": "string | null"
}
```

`progress` is an **integer 0–100**, not a fraction. It is rendered as
"{n}% reported by the backend". It must never exceed 100 or go backwards.

Return immediately with `status: "QUEUED"`, `progress: 0`, `startedAt` set. Do not run
the analysis inline.

### 9.2 `GET /api/v1/products/{product_id}/analysis`

Returns the **current or most recent** `Analysis` for the product. This is the polling
endpoint.

Critical: **this endpoint must return `200` with an `Analysis` object even when no
analysis has ever been started.** Return `status: "NOT_STARTED"`, a fresh `id`, null
timestamps, and `progress: 0`. Returning `404` here is wrong — the product detail page
would show an error banner for a brand-new product instead of a neutral "Not started"
state.

The product detail page calls this on load and on manual refresh. It does **not** poll
on a timer; the user refreshes, or the documents vault's 4 s poll advances the view.
(Adding a client poll for this endpoint is a straightforward frontend follow-up — see
§12.3.)

### 9.3 Analysis side-effects on completion

When an analysis reaches `COMPLETED`, the backend must, in one consistent transaction:

1. Write the `Finding` rows for the product.
2. Update the product's `findingCount` and `risks` summary.
3. Update the product's `lastAnalysisAt`.
4. Advance the `regulatory_analysis` workflow stage to `COMPLETED` and `risk_review`
   to `ACTIVE`.
5. Update `activeAnalysisCount` to reflect reality (via the dashboard summary).
6. Create `ReviewTask` rows for findings that require human verification, so they
   appear in the review queue.

Re-running an analysis must **replace** the previous findings for that product, not
accumulate duplicates. The product detail page counts open findings from the current
`GET .../findings` response.

### 9.4 `GET /api/v1/products/{product_id}/findings`

Returns `Finding` objects:
```json
{
  "id": "string",
  "analysisId": "string",
  "productId": "string",
  "productName": "string",
  "title": "string",
  "summary": "string",
  "severity": "HIGH | MEDIUM | LOW",
  "status": "FindingStatus",
  "category": "string | null",
  "statutoryReference": "string | null",
  "correctiveAction": "string | null",
  "detectedAt": "ISO-8601 | null"
}
```

`severity` and `status` are **non-nullable** — the severity chip and status badge index
directly into maps. `summary` is also non-nullable and is rendered as body copy.
`statutoryReference` should be a citation string; `null` renders
"No statutory reference returned". `correctiveAction` should be actionable text for
`HIGH` findings.

Returning `[]` is a valid outcome: the product detail Findings tab shows "No findings
available" and offers to start an analysis.

---

## 10. Evidence

### `GET /api/v1/evidence`

Returns `Evidence` objects. Optional `findingId` and `productId` query params are
supported by the client but **not currently used** — the Evidence Viewer and Review
Queue both load the full set and filter in memory.

`Evidence`:
```json
{
  "id": "string",
  "findingId": "string | null",
  "sourceId": "string",
  "authority": "string",
  "sourceTitle": "string",
  "documentTitle": "string | null",
  "section": "string | null",
  "page": 1,
  "version": "string | null",
  "effectiveDate": "string | null",
  "excerpt": "string | null",
  "status": "EvidenceStatus",
  "sourceUrl": "string | null"
}
```

Evidence is produced by the retrieval layer and is expected to be sparse in a fresh
system. The Evidence Viewer's three columns are:

- **left** — findings, derived from the *review queue* (`getReviewQueue`), filtered by
  severity, with an evidence count per finding;
- **middle** — the excerpt canvas, from `Evidence`;
- **right** — analysis metadata: `authority`, `sourceTitle`, `documentTitle`, `section`,
  `page`, `version`, `effectiveDate`, `sourceUrl`.

Every one of these is rendered conditionally on being non-null, so nulls are safe and
displayed as absent. `sourceUrl` is rendered as an external link and must be an absolute
`https://` URL. `page` is `0`-indexed or `1`-indexed — either is fine, the frontend only
displays it.

`evidenceCount` on a `Claim` (§7.1) and on a `ReviewTask` (§11) must agree with the
actual number of non-null-`status` evidence rows attached to that finding. The Evidence
Viewer and the claims drawer both display these counts, so inconsistency is visible.

---

## 11. Review queue

### 11.1 `GET /api/v1/reviews`

Returns `ReviewTask` objects. Optional `status` and `severity` query params.

`ReviewTask`:
```json
{
  "id": "string",
  "findingId": "string",
  "productId": "string",
  "productName": "string",
  "title": "string",
  "severity": "HIGH | MEDIUM | LOW",
  "status": "ReviewTaskStatus",
  "assigneeId": "string | null",
  "assigneeName": "string | null",
  "requestedAt": "ISO-8601 | null",
  "decidedAt": "ISO-8601 | null",
  "decisionNote": "string | null"
}
```

Two views depend on accurate values here:

- The **"Assigned to Me"** tab filters `assigneeId === session.user.id`. Populate
  `assigneeId` with the same ID space as `SessionUser.id`, otherwise the tab is always
  empty.
- The **Completed** tab is derived from `status ∈ {APPROVED, REJECTED, ESCALATED,
  CANCELLED}`. Everything else counts as pending.

`title` should mirror the linked finding's title. `severity` mirrors the finding's
severity.

### 11.2 `POST /api/v1/reviews/{id}/decision`

Request body (`ReviewDecisionInput`):
```json
{ "decision": "APPROVE | REJECT | REQUEST_MORE_EVIDENCE | ESCALATE", "note": "string (optional)" }
```

`note` is **omitted** when the reviewer leaves it blank (not sent as `""`).

**Response: the updated `ReviewTask`.**

The frontend immediately shows a "saved" confirmation and refetches, so the response
should reflect the persisted state: `status` mapped from the decision, `decidedAt` set,
`decisionNote` populated, and the finding's `status` updated in the same transaction.

**Decision → status mapping the backend must apply:**

| Decision | `ReviewTask.status` | Suggested `Finding.status` |
| --- | --- | --- |
| `APPROVE` | `APPROVED` | `RESOLVED` |
| `REJECT` | `REJECTED` | `UNRESOLVED` |
| `REQUEST_MORE_EVIDENCE` | `IN_REVIEW` | `IN_PROGRESS` |
| `ESCALATE` | `ESCALATED` | `UNRESOLVED` |

`CANCELLED` is a backend-only state (e.g. the finding was withdrawn); the client can
never produce it.

The backend must record **who** decided and **when** for the audit trail. The frontend
does not send an actor, so this must come from the session (§3.3).

---

## 12. Compliance items, reports, and sources

### 12.1 `GET /api/v1/products/{product_id}/compliance-items`

`ComplianceItem`:
```json
{
  "id": "string",
  "productId": "string | null",
  "label": "string",
  "note": "string | null",
  "passed": true,
  "category": "string | null"
}
```

`passed` is **tri-state**: `true` (pass), `false` (fail), `null` (pending). This is
load-bearing — the Compliance Checklist page renders three distinct states and computes
its completion bar from them. Returning `false` for "not yet evaluated" would show every
unrun check as a failure.

`category` groups the checks. The page sorts a fixed set first
(`Product Composition`, `Labelling`, `Claims & Advertising`, `Safety Documentation`,
`Process & Records`) and places anything else under "Uncategorised" — so use those exact
strings to get the intended grouping.

`label` is the check text; `note` is the explanation shown beneath it.

This checklist is **read-only in the frontend** — there is no `PATCH` for compliance
items. It is regenerated by the analysis engine.

### 12.2 Reports

**`GET /api/v1/products/{product_id}/reports`** → `ComplianceReport` objects:
```json
{
  "id": "string",
  "productId": "string",
  "productName": "string",
  "title": "string",
  "status": "PENDING | GENERATING | READY | FAILED",
  "generatedAt": "ISO-8601 | null",
  "downloadUrl": "string | null",
  "failureReason": "string | null"
}
```

**`POST /api/v1/products/{product_id}/reports`** — no body. Queues report generation and
returns the created `ComplianceReport` with `status: "PENDING"`.

Report generation must be **asynchronous** for the same reason as extraction (§8.3): the
Reports page blocks the button while any report is `PENDING`/`GENERATING` and relies on
manual refresh, so a synchronous render risks a timeout.

`downloadUrl` rules:
- Only rendered when `status === "READY"` **and** `downloadUrl` is non-null.
- Opened in a new tab with `rel="noopener noreferrer"`.
- Must be a reachable absolute URL — a presigned object-store URL or an authenticated
  file endpoint. **There is no file-proxy endpoint in the frontend contract**, so
  `downloadUrl` is the only way to deliver a report. A relative path will open a 404.
- Set `generatedAt` when generation completes; leave `null` while pending.

On `FAILED`, populate `failureReason`.

### 12.3 Statutory sources

**`GET /api/v1/statutory-sources`** — note the hyphenated path. Returns:
```json
{
  "id": "string",
  "authority": "string",
  "title": "string",
  "documentTitle": "string | null",
  "sourceType": "ACT | REGULATION | GUIDANCE | STANDARD | NOTIFICATION | null",
  "jurisdiction": "string | null",
  "version": "string | null",
  "effectiveDate": "string | null",
  "lastIndexedAt": "ISO-8601 | null",
  "sourceUrl": "string | null",
  "citationCount": 0
}
```

Optional query params `authority`, `jurisdiction`, `search` are supported by the client
service, but the page currently filters in memory after fetching all sources.

`citationCount` is a number of findings that reference this source. It is displayed in
the source ledger, so keep it accurate.

`sourceUrl` is rendered as an external link and should be an absolute `https://` URL to
the official publication. A new source index with zero rows is a legitimate state — the
page shows "No statutory sources available".

**`GET /api/v1/statutory-sources/{id}`** → a single source. **Must `404`** for an unknown
ID.

**There is no source-ingestion endpoint.** The "+ Add Source" button is permanently
disabled; ingestion is a backend knowledge-base job. Sources come from the RAG index,
which is why the UI labels them "Reported by RAG index".

---

## 13. Deliberately absent endpoints

The frontend has **no** client function for these. They are not oversights in this
document; they are UI states that were intentionally rendered disabled with an
explanatory tooltip.

| Feature | Why there is no endpoint |
| --- | --- |
| Document preview / file download | The vault shows metadata only. No file endpoint is called. |
| Document → finding linking | No linking call exists. Evidence is attached during analysis. |
| Document category management | `document_type` is a closed API enum (§2.9). |
| Ingredient create / update | Ingredients arrive via document extraction (§6). |
| Statutory source ingestion | Performed by the backend index (§12.3). |
| Compliance item mutation | The checklist is read-only (§12.1). |
| Settings persistence | No settings resource; preferences live in the browser session. |
| Alert notifications | The bell shows a static "connect the backend" message; no feed endpoint is called. |

If any of these are wanted later, the change is: add the client function, then wire the
button. The tooltip text on each disabled control should be updated in the same change.

---

## 14. Frontend gaps the backend cannot solve

These are client-side limitations found while writing this contract. The backend may
still implement the corresponding capability, but **the frontend must change first** for
any of it to take effect. Listed here so they are not mistaken for backend bugs.

1. **`?product=`, `?finding=`, and `?search=` deep links are not read.**
   `/readiness`, `/evidence`, `/sources`, and `/reviews` receive these params from
   in-app links (e.g. `/readiness?product=abc`, `/evidence?finding=xyz`,
   `/sources?search=fssai` from the header search) but do not read them with
   `useSearchParams`. `/compliance` and `/reports` **do** read `?product=`. Effect:
   clicking through from a product lands on a page scoped to the first product rather
   than the intended one. Fix is a small `Suspense` + `useSearchParams` change in those
   four pages.
2. **The product detail page does not poll analysis status.** `GET
   /api/v1/products/{id}/analysis` is fetched on load and on manual refresh only. A long
   analysis shows its progress state until the user clicks Refresh. The Documents page
   already polls at 4 s; the same pattern applies here.
3. **No server-side filtering anywhere.** Every list endpoint is fetched in full and
   filtered in the browser. Fine for hundreds of records, not for tens of thousands.
   If scale requires server-side filtering, the query params in §1.5 must be honoured
   and the service functions must start passing them (several already accept a `query`
   argument that is currently discarded).
4. **No pagination, sorting, or server-side search.**
5. **`PATCH /products/{id}` and `DELETE /documents/{id}` are implemented client-side but
   invoked by no UI** (§5.4, §8.4).
6. **4xx detail messages are discarded** (§1.3), so field-level validation errors cannot
   reach the user.

---

## 15. CORS and local development

The frontend runs on `http://localhost:3000` by default and calls the API cross-origin.
The backend must therefore allow it:

```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Credentials: true      # required if using cookie sessions
```

`Access-Control-Allow-Origin` must **not** be `*` when credentials are enabled — the
browser rejects that combination, and the failure appears in the UI as
`ApiError("network")` ("Backend unavailable"), which is indistinguishable from the
backend being down. This is the single most likely cause of a "backend unreachable"
report during integration.

Because `cache: "no-store"` is used on every request, the API must not be cached
aggressively by a reverse proxy in development, or responses will appear stale.

---

## 16. Integration checklist

Work through this in order; each step is independently verifiable in the UI.

1. `GET /api/v1/auth/session` → sidebar shows a name, or "Not signed in". Both are
   correct; a crash is not.
2. `GET /api/v1/products` → `/products` renders a ledger, or its empty state for `[]`.
3. `POST /api/v1/products` → the "New Product" dialog creates a product and lands on
   `/products/{id}` with a populated name and a nine-stage workflow.
4. `GET /api/v1/products/{id}/analysis` → returns `200` with `NOT_STARTED`, never `404`.
5. `POST /api/v1/documents` (a real PDF) → progress reaches 100%, then the vault row
   advances `UPLOADED → PROCESSING → PROCESSED` within a few poll cycles.
6. `POST /api/v1/products/{id}/analysis` → `QUEUED` immediately; findings and
   `findingCount` appear after completion; `lastAnalysisAt` updates.
7. `GET /api/v1/products/{id}/compliance-items` → checklist with a mix of `true`,
   `false`, and `null`.
8. `GET /api/v1/reviews` → the queue shows tasks; the "Assigned to Me" tab works when
   `assigneeId` matches the session ID.
9. `POST /api/v1/reviews/{id}/decision` → status changes, the row moves to Completed, and
   the finding's status changes with it.
10. `GET /api/v1/statutory-sources` → the ledger renders, or "No statutory sources
    available" for `[]`.
11. `POST /api/v1/products/{id}/reports` → `PENDING`; after generation, `READY` with a
    working `downloadUrl`.
12. `GET /api/v1/dashboard/summary` → the dashboard metrics match the other screens'
    counts. This is the best single cross-check that the backend is internally
    consistent.

### Things that will look like backend bugs but are not

| Symptom | Cause |
| --- | --- |
| Every screen says "Backend unavailable" | `NEXT_PUBLIC_API_URL` unset, or CORS rejected the preflight (§15). |
| Products list is empty but products exist | Backend returned `{data: [...]}` instead of an array or `{items}` (§1.4). |
| Dashboard metrics are `undefined` | Summary returned an envelope; it must be flat (§4). |
| A page crashes with a `Cannot read properties of undefined` | An enum token outside §2, or a non-nullable field sent as `null`. |
| Compliance page shows everything as failing | `passed: null` was sent as `false` (§12.1). |
| Analysis spinner never clears | `activeAnalysisCount` or the analysis status is stuck; the run must reach a terminal state. |
| New product page is blank after creation | `POST /products` did not return a full `Product` (§5.3). |
| Report download 404s | `downloadUrl` was relative or expired (§12.2). |
| Upload fails immediately with no progress event | The backend set a `Content-Type` on the multipart request, breaking the boundary (§8.3). |
| "Assigned to Me" is always empty | `ReviewTask.assigneeId` does not match `SessionUser.id` (§11.1). |
