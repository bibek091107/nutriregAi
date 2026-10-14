import type { BadgeTone } from "@/components/ui/controls";
import type {
  AnalysisStatus,
  ClaimStatus,
  DocumentStatus,
  FindingSeverity,
  FindingStatus,
  IngredientComplianceStatus,
  ProductStatus,
  ReportStatus,
  ReviewTaskStatus,
  StageState,
} from "@/lib/api/types";
import { humanize } from "@/lib/format";

/**
 * Maps backend enums onto the badge colours already used in the approved design.
 * The frontend performs no regulatory interpretation — it renders whatever state
 * the backend reports, including "Pending Analysis".
 */

const PRODUCT_STATUS: Record<ProductStatus, { tone: BadgeTone; icon: string }> = {
  DRAFT: { tone: "muted", icon: "edit_note" },
  NOT_STARTED: { tone: "muted", icon: "hourglass_empty" },
  IN_PROGRESS: { tone: "active", icon: "schedule" },
  REVIEW_REQUIRED: { tone: "warning", icon: "pending_actions" },
  NEEDS_ATTENTION: { tone: "danger", icon: "error" },
  COMPLETED: { tone: "success", icon: "check_circle" },
};

export const productStatusBadge = (status: ProductStatus) => PRODUCT_STATUS[status];

const CLAIM_STATUS: Record<ClaimStatus, { tone: BadgeTone; icon: string }> = {
  PENDING_ANALYSIS: { tone: "muted", icon: "hourglass_empty" },
  SUPPORTED: { tone: "success", icon: "check_circle" },
  QUALIFIER_REQUIRED: { tone: "warning", icon: "gavel" },
  NOT_SUPPORTED: { tone: "danger", icon: "cancel" },
  PROHIBITED: { tone: "danger", icon: "block" },
};

export const claimStatusBadge = (status: ClaimStatus) => CLAIM_STATUS[status];

const INGREDIENT_STATUS: Record<
  IngredientComplianceStatus,
  { tone: BadgeTone; icon: string }
> = {
  PENDING_ANALYSIS: { tone: "muted", icon: "hourglass_empty" },
  COMPLIANT: { tone: "success", icon: "check_circle" },
  REVIEW_REQUIRED: { tone: "warning", icon: "pending_actions" },
  NON_COMPLIANT: { tone: "danger", icon: "cancel" },
};

export const ingredientStatusBadge = (status: IngredientComplianceStatus) =>
  INGREDIENT_STATUS[status];

const DOCUMENT_STATUS: Record<DocumentStatus, { tone: BadgeTone; icon: string }> = {
  UPLOADING: { tone: "active", icon: "upload" },
  UPLOADED: { tone: "muted", icon: "cloud_upload" },
  PROCESSING: { tone: "active", icon: "sync" },
  PROCESSED: { tone: "success", icon: "check_circle" },
  FAILED: { tone: "danger", icon: "error" },
};

export const documentStatusBadge = (status: DocumentStatus) => DOCUMENT_STATUS[status];

const FINDING_STATUS: Record<FindingStatus, { tone: BadgeTone; dot: string; icon: string }> = {
  OPEN: { tone: "danger", dot: "bg-error", icon: "error" },
  IN_PROGRESS: { tone: "warning", dot: "bg-amber-500", icon: "pending_actions" },
  UNRESOLVED: { tone: "warning", dot: "bg-[#b45309]", icon: "report_problem" },
  RESOLVED: { tone: "success", dot: "bg-emerald-600", icon: "check_circle" },
};

export const findingStatusBadge = (status: FindingStatus) => FINDING_STATUS[status];

const SEVERITY: Record<FindingSeverity, { label: string; className: string }> = {
  HIGH: {
    label: "High",
    className:
      "bg-[#fff1f2] text-[#be123c] border-[#fecdd3] hover:border-[#fda4af]",
  },
  MEDIUM: {
    label: "Medium",
    className: "bg-[#fffbeb] text-[#b45309] border-[#fde68a] hover:border-[#fcd34d]",
  },
  LOW: {
    label: "Low",
    className:
      "bg-surface-container text-on-surface-variant border-outline-variant/60 hover:border-outline-variant",
  },
};

export const severityStyle = (severity: FindingSeverity) => SEVERITY[severity];

/**
 * Claims and ingredients also report "NONE", meaning the backend found no
 * risk. It renders as a neutral chip rather than a severity colour.
 */
export function riskStyle(risk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | null): {
  label: string;
  className: string;
} {
  if (!risk || risk === "NONE") {
    return {
      label: "None",
      className:
        "bg-surface-container-low text-on-surface-variant border-outline-variant/60 hover:border-outline-variant",
    };
  }
  return SEVERITY[risk];
}

const REVIEW_STATUS: Record<ReviewTaskStatus, { tone: BadgeTone; icon: string }> = {
  PENDING: { tone: "warning", icon: "pending_actions" },
  IN_REVIEW: { tone: "active", icon: "rate_review" },
  APPROVED: { tone: "success", icon: "check_circle" },
  REJECTED: { tone: "danger", icon: "cancel" },
  ESCALATED: { tone: "danger", icon: "escalator_warning" },
  CANCELLED: { tone: "muted", icon: "cancel" },
};

export const reviewStatusBadge = (status: ReviewTaskStatus) => REVIEW_STATUS[status];

const ANALYSIS_STATUS: Record<AnalysisStatus, { label: string; tone: BadgeTone; icon: string }> = {
  NOT_STARTED: { label: "Not started", tone: "muted", icon: "hourglass_empty" },
  QUEUED: { label: "Queued", tone: "active", icon: "pending" },
  PROCESSING: { label: "Processing", tone: "active", icon: "sync" },
  COMPLETED: { label: "Analysis complete", tone: "success", icon: "check_circle" },
  FAILED: { label: "Analysis failed", tone: "danger", icon: "error" },
};

export const analysisStatusBadge = (status: AnalysisStatus) => ANALYSIS_STATUS[status];

const REPORT_STATUS: Record<ReportStatus, { tone: BadgeTone; icon: string }> = {
  PENDING: { tone: "muted", icon: "hourglass_empty" },
  GENERATING: { tone: "active", icon: "sync" },
  READY: { tone: "success", icon: "check_circle" },
  FAILED: { tone: "danger", icon: "error" },
};

export const reportStatusBadge = (status: ReportStatus) => REPORT_STATUS[status];

/** Workflow stage presentation taken from the 9-stage stepper. */
export function stagePresentation(state: StageState) {
  switch (state) {
    case "COMPLETED":
      return { icon: "check_circle", iconClass: "text-on-tertiary-container", label: "Completed" };
    case "ACTIVE":
      return { icon: null, iconClass: "", label: "Active scan" };
    default:
      return { icon: "radio_button_unchecked", iconClass: "", label: "Pending" };
  }
}

export { humanize };
