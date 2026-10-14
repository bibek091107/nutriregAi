"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { ApiError } from "@/lib/api/client";
import { submitReviewDecision } from "@/lib/api";
import type { ReviewDecision, ReviewTaskStatus } from "@/lib/api/types";
import { humanize } from "@/lib/format";

/**
 * Human Verification Gate from the approved Evidence Viewer / Review Queue
 * designs. Decisions POST to the backend; nothing is applied locally when the
 * API is unavailable.
 */
export function ReviewDecisionPanel({
  reviewId,
  status,
  findingId,
  findingTitle,
  onDecided,
}: {
  reviewId: string;
  status: ReviewTaskStatus;
  findingId?: string | null;
  findingTitle?: string | null;
  onDecided?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewDecision | null>(null);

  const settled = status !== "PENDING" && status !== "IN_REVIEW";

  const submit = async () => {
    if (!decision) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReviewDecision(reviewId, { decision, note: note.trim() || undefined });
      setDone(decision);
      setOpen(false);
      setNote("");
      onDecided?.();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.userMessage : "The decision could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };

  if (settled) {
    return (
      <div className="p-space-sm bg-surface-container rounded-lg flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-[10px] font-bold text-secondary uppercase tracking-wider">
            Human Verification Gate
          </span>
          <span className="font-label-sm text-[11px] text-on-surface font-semibold">
            {humanize(status)}
          </span>
        </div>
        <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
          This review task has been decided. The decision and any note are held by the backend.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div
        role="status"
        className="p-space-sm bg-surface-container rounded-lg flex flex-col gap-space-xs"
      >
        <div className="flex items-center justify-between">
          <span className="font-label-caps text-[10px] font-bold text-secondary uppercase tracking-wider">
            Human Verification Gate
          </span>
          <span className="font-label-sm text-[11px] text-on-surface font-semibold">
            Submitted
          </span>
        </div>
        <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
          &ldquo;{humanize(done)}&rdquo; was sent to the backend. It appears as saved once the review
          queue refreshes with the new status.
        </p>
      </div>
    );
  }

  return (
    <div className="p-space-sm bg-surface-container rounded-lg flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-[10px] font-bold text-secondary uppercase tracking-wider">
          Human Verification Gate
        </span>
        <span className="font-label-sm text-[11px] text-on-surface font-semibold">Pending Sign-off</span>
      </div>
      <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed">
        AI assists the reviewer and does not replace legal regulatory sign-off.
      </p>

      {!open ? (
        <div className="flex flex-col gap-1.5 pt-1">
          <Button
            variant="primary"
            icon="check"
            onClick={() => {
              setDecision("APPROVE");
              setOpen(true);
            }}
          >
            Approve Regulatory Finding
          </Button>
          <div className="grid grid-cols-2 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              icon="help_outline"
              onClick={() => {
                setDecision("REQUEST_MORE_EVIDENCE");
                setOpen(true);
              }}
            >
              Request Info
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon="gavel"
              onClick={() => {
                setDecision("ESCALATE");
                setOpen(true);
              }}
            >
              Escalate Legal
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDecision("REJECT");
              setOpen(true);
            }}
            className="text-center font-label-sm text-[11px] text-on-surface-variant hover:text-error transition-colors py-0.5"
          >
            Mark as False Positive
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
              Decision
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/50 font-label-sm text-[11px] font-semibold text-on-surface">
              <Icon className="text-[14px] text-secondary">
                {decision === "APPROVE"
                  ? "check"
                  : decision === "REJECT"
                    ? "cancel"
                    : decision === "ESCALATE"
                      ? "gavel"
                      : "help_outline"}
              </Icon>
              {humanize(decision ?? "APPROVE")}
            </span>
            {findingId ? (
              <span className="font-data-mono text-[10px] text-on-surface-variant">
                {findingId}
              </span>
            ) : null}
          </div>
          {findingTitle ? (
            <p className="font-body-sm text-[11px] text-on-surface leading-snug">{findingTitle}</p>
          ) : null}
          <label htmlFor={`review-note-${reviewId}`} className="sr-only">
            Decision note
          </label>
          <textarea
            id={`review-note-${reviewId}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Add the rationale recorded against this finding..."
            className="px-2 py-1.5 rounded bg-surface-container-lowest border border-outline-variant/60 font-body-sm text-[12px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-secondary"
          />
          {error ? (
            <p role="alert" className="font-body-sm text-[11px] text-error">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="surface"
              size="sm"
              onClick={() => {
                setOpen(false);
                setNote("");
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant={decision === "REJECT" ? "danger" : "primary"}
              size="sm"
              onClick={submit}
              disabled={submitting}
              icon={submitting ? undefined : "send"}
            >
              {submitting ? "Submitting..." : "Submit Decision"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
