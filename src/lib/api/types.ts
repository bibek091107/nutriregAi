/**
 * Domain models for the NutriReg AI platform.
 *
 * These types describe the contract with the FastAPI backend. They intentionally
 * contain no demo values: every field is either supplied by the backend or empty.
 */

export type ISODateString = string;

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export type ProductCategory =
  | "FUNCTIONAL_FOOD"
  | "FUNCTIONAL_BEVERAGE"
  | "DIETARY_SUPPLEMENT"
  | "SPORTS_NUTRITION"
  | "FORTIFIED_CEREAL"
  | "OTHER";

export type TargetMarket =
  | "INDIA_FSSAI"
  | "USA_FDA"
  | "EU_EFSA"
  | "UAE_MOIAT"
  | "OTHER";

export type ProductStatus =
  | "DRAFT"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "REVIEW_REQUIRED"
  | "NEEDS_ATTENTION"
  | "COMPLETED";

/** The nine-stage regulatory workflow from the Products & Workflows design. */
export type WorkflowStageKey =
  | "product_setup"
  | "ingredients"
  | "claims"
  | "documents"
  | "regulatory_analysis"
  | "risk_review"
  | "compliance_checklist"
  | "human_review"
  | "report";

export type StageState = "PENDING" | "ACTIVE" | "COMPLETED";

export interface WorkflowStage {
  key: WorkflowStageKey;
  label: string;
  state: StageState;
  completedAt?: ISODateString | null;
}

export interface RiskSummary {
  high: number;
  medium: number;
  low: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: ProductCategory | null;
  targetMarket: TargetMarket | null;
  description: string | null;
  status: ProductStatus;
  stages: WorkflowStage[];
  risks: RiskSummary;
  claimCount: number;
  documentCount: number;
  ingredientCount: number;
  findingCount: number;
  lastAnalysisAt: ISODateString | null;
  createdAt: ISODateString | null;
}

/** Payload for creating a product. */
export interface CreateProductInput {
  name: string;
  category: ProductCategory;
  targetMarket: TargetMarket;
  description?: string;
  sku?: string;
}

/* -------------------------------------------------------------------------- */
/* Ingredients                                                                 */
/* -------------------------------------------------------------------------- */

export type IngredientComplianceStatus =
  | "PENDING_ANALYSIS"
  | "COMPLIANT"
  | "REVIEW_REQUIRED"
  | "NON_COMPLIANT";

export interface ProductIngredient {
  id: string;
  productId: string;
  productName: string;
  name: string;
  casNumber: string | null;
  amountPerServing: number | null;
  amountUnit: string | null;
  isActive: boolean;
  status: IngredientComplianceStatus;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | null;
  statusNote: string | null;
  evaluatedAt: ISODateString | null;
}

/* -------------------------------------------------------------------------- */
/* Claims                                                                      */
/* -------------------------------------------------------------------------- */

export type ClaimType =
  | "NUTRIENT_FUNCTION"
  | "HEALTH"
  | "NUTRITIONAL_CONTENT"
  | "STRUCTURAL_FUNCTION"
  | "OTHER";

export type ClaimStatus =
  | "PENDING_ANALYSIS"
  | "SUPPORTED"
  | "QUALIFIER_REQUIRED"
  | "NOT_SUPPORTED"
  | "PROHIBITED";

export interface Claim {
  id: string;
  productId: string;
  productName: string;
  text: string;
  claimType: ClaimType | null;
  targetMarket: TargetMarket | null;
  status: ClaimStatus;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | null;
  disclaimer: string | null;
  evidenceCount: number;
  statusNote: string | null;
  lastReviewedAt: ISODateString | null;
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export type DocumentType =
  | "PRODUCT_SPEC"
  | "CERTIFICATE_OF_ANALYSIS"
  | "LAB_REPORT"
  | "SAFETY_SHEET"
  | "LABEL_ARTWORK"
  | "OTHER";

export type DocumentStatus =
  | "UPLOADING"
  | "UPLOADED"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

export interface VaultDocument {
  id: string;
  productId: string | null;
  productName: string | null;
  fileName: string;
  documentType: DocumentType | null;
  sizeBytes: number | null;
  status: DocumentStatus;
  extractionStatus: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED" | null;
  uploadedAt: ISODateString | null;
  failureReason: string | null;
}

/* -------------------------------------------------------------------------- */
/* Analysis, findings, evidence                                               */
/* -------------------------------------------------------------------------- */

export type AnalysisStatus =
  | "NOT_STARTED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface Analysis {
  id: string;
  productId: string;
  status: AnalysisStatus;
  progress: number;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  failureReason: string | null;
}

export type FindingSeverity = "HIGH" | "MEDIUM" | "LOW";

export type FindingStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "UNRESOLVED";

export interface Finding {
  id: string;
  analysisId: string;
  productId: string;
  productName: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  status: FindingStatus;
  category: string | null;
  statutoryReference: string | null;
  correctiveAction: string | null;
  detectedAt: ISODateString | null;
}

export type EvidenceStatus =
  | "PENDING"
  | "RELEVANT"
  | "PARTIALLY_RELEVANT"
  | "NOT_RELEVANT";

export interface Evidence {
  id: string;
  findingId: string | null;
  sourceId: string;
  authority: string;
  sourceTitle: string;
  documentTitle: string | null;
  section: string | null;
  page: number | null;
  version: string | null;
  effectiveDate: string | null;
  excerpt: string | null;
  status: EvidenceStatus;
  sourceUrl: string | null;
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                     */
/* -------------------------------------------------------------------------- */

export type ReviewDecision =
  | "APPROVE"
  | "REJECT"
  | "REQUEST_MORE_EVIDENCE"
  | "ESCALATE";

export type ReviewTaskStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED"
  | "CANCELLED";

export interface ReviewTask {
  id: string;
  findingId: string;
  productId: string;
  productName: string;
  title: string;
  severity: FindingSeverity;
  status: ReviewTaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  requestedAt: ISODateString | null;
  decidedAt: ISODateString | null;
  decisionNote: string | null;
}

export interface ReviewDecisionInput {
  decision: ReviewDecision;
  note?: string;
}

/* -------------------------------------------------------------------------- */
/* Statutory sources                                                           */
/* -------------------------------------------------------------------------- */

export interface StatutorySource {
  id: string;
  authority: string;
  title: string;
  documentTitle: string | null;
  sourceType: "ACT" | "REGULATION" | "GUIDANCE" | "STANDARD" | "NOTIFICATION" | null;
  jurisdiction: string | null;
  version: string | null;
  effectiveDate: string | null;
  lastIndexedAt: ISODateString | null;
  sourceUrl: string | null;
  citationCount: number;
}

/* -------------------------------------------------------------------------- */
/* Compliance checklist, reports, dashboard                                   */
/* -------------------------------------------------------------------------- */

export interface ComplianceItem {
  id: string;
  productId: string | null;
  label: string;
  note: string | null;
  passed: boolean | null;
  category: string | null;
}

export type ReportStatus = "PENDING" | "GENERATING" | "READY" | "FAILED";

export interface ComplianceReport {
  id: string;
  productId: string;
  productName: string;
  title: string;
  status: ReportStatus;
  generatedAt: ISODateString | null;
  downloadUrl: string | null;
  failureReason: string | null;
}

export interface DashboardSummary {
  productCount: number;
  activeAnalysisCount: number;
  highRiskCount: number;
  pendingReviewCount: number;
  readiness: {
    ready: number;
    reviewRequired: number;
    missingInformation: number;
  };
}
