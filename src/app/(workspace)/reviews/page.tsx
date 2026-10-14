"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ReviewDecisionPanel } from "@/components/reviews/ReviewDecisionPanel";
import { useResource } from "@/lib/hooks/useResource";
import { getEvidence, getReviewQueue } from "@/lib/api";
import { formatDate, humanize } from "@/lib/format";
import { useSession } from "@/lib/auth/session";
import type { Evidence, FindingSeverity, ReviewTask } from "@/lib/api/types";

type QueueTab = "ALL" | "PENDING" | "HIGH" | "MINE" | "COMPLETED";

const DECIDED_STATUSES = ["APPROVED", "REJECTED", "ESCALATED", "CANCELLED"];

const SEVERITY_ORDER: FindingSeverity[] = ["HIGH", "MEDIUM", "LOW"];

/** Dense audit table + persistent detail drawer, as designed in the Stitch export. */
export default function ReviewsPage() {
  const session = useSession();
  const reviews = useResource<ReviewTask[]>((signal) => getReviewQueue(signal), []);
  const evidence = useResource<Evidence[]>((signal) => getEvidence(signal), []);

  const [tab, setTab] = useState<QueueTab>("PENDING");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<"ALL" | FindingSeverity>("ALL");
  const [productFilter, setProductFilter] = useState<"ALL" | string>("ALL");

  const all = useMemo(() => reviews.data ?? [], [reviews.data]);
  const allEvidence = useMemo(() => evidence.data ?? [], [evidence.data]);

  const pending = useMemo(
    () => all.filter((task) => !DECIDED_STATUSES.includes(task.status)),
    [all],
  );
  const completed = useMemo(
    () => all.filter((task) => DECIDED_STATUSES.includes(task.status)),
    [all],
  );
  const highPriority = useMemo(
    () => pending.filter((task) => task.severity === "HIGH"),
    [pending],
  );
  const assignedToMe = useMemo(
    () =>
      session.user
        ? pending.filter((task) => task.assigneeId === session.user?.id)
        : [],
    [pending, session.user],
  );

  const tabs: { key: QueueTab; label: string; count: number; dot?: string }[] = [
    { key: "ALL", label: "All", count: all.length },
    { key: "PENDING", label: "Pending", count: pending.length, dot: "bg-secondary" },
    { key: "HIGH", label: "High Priority", count: highPriority.length, dot: "bg-error" },
    { key: "MINE", label: "Assigned to Me", count: assignedToMe.length },
    { key: "COMPLETED", label: "Completed", count: completed.length },
  ];

  const visible = useMemo(() => {
    const base =
      tab === "ALL"
        ? all
        : tab === "PENDING"
          ? pending
          : tab === "HIGH"
            ? highPriority
            : tab === "MINE"
              ? assignedToMe
              : completed;
    const filtered = base.filter((task) => {
      if (severityFilter !== "ALL" && task.severity !== severityFilter) return false;
      if (productFilter !== "ALL" && task.productId !== productFilter) return false;
      return true;
    });
    const term = search.trim().toLowerCase();
    if (!term) return filtered;
    return filtered.filter(
      (task) =>
        task.title.toLowerCase().includes(term) ||
        task.productName.toLowerCase().includes(term) ||
        task.id.toLowerCase().includes(term),
    );
  }, [all, pending, highPriority, assignedToMe, completed, tab, search, severityFilter, productFilter]);

  /** Product options come from the queue the API returned, never a hardcoded list. */
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of all) {
      if (!seen.has(task.productId)) seen.set(task.productId, task.productName);
    }
    return [...seen.entries()];
  }, [all]);

  const filtersActive = severityFilter !== "ALL" || productFilter !== "ALL";

  const selected = useMemo(
    () => visible.find((task) => task.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const selectedEvidence = useMemo(
    () => allEvidence.filter((item) => item.findingId === selected?.findingId),
    [allEvidence, selected],
  );

  const evidenceCountFor = (findingId: string) =>
    allEvidence.filter((item) => item.findingId === findingId).length;

  const refresh = () => {
    reviews.refetch();
    evidence.refetch();
  };

  return (
    <div className="flex flex-col w-full">
      <div className="px-space-lg py-space-md border-b border-outline-variant/40 bg-surface-container-lowest flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
          <div>
            <div className="flex items-center gap-space-sm">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                Review Queue
              </h1>
              {pending.length > 0 ? (
                <span className="inline-flex items-center gap-1 px-space-xs py-0.5 rounded text-error bg-error-container/40 border border-error/20 font-label-caps text-label-caps">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                  {pending.length} item{pending.length === 1 ? "" : "s"} require review
                </span>
              ) : null}
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Review AI-generated regulatory findings and resolve items requiring human verification.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-space-xs self-start md:self-auto flex-wrap">
          <Button variant="ghost" icon="sync" onClick={refresh}>
            Refresh
          </Button>
          <Button
            variant="outline"
            icon="task_alt"
            onClick={() => setTab("COMPLETED")}
            disabled={completed.length === 0}
          >
            View Completed Reviews
            {completed.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-surface-container font-data-mono text-[10px] text-secondary font-semibold ml-1">
                {completed.length}
              </span>
            ) : null}
          </Button>
          </div>

          {filtersOpen ? (
            <div className="flex flex-wrap items-end gap-space-md px-space-md pb-space-md">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="review-severity"
                  className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant"
                >
                  Severity
                </label>
                <select
                  id="review-severity"
                  value={severityFilter}
                  onChange={(event) =>
                    setSeverityFilter(event.target.value as "ALL" | FindingSeverity)
                  }
                  className="h-8 px-2 rounded bg-surface-container-lowest border border-outline-variant/60 text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
                >
                  <option value="ALL">All severities</option>
                  {SEVERITY_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {humanize(value)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="review-product"
                  className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant"
                >
                  Product
                </label>
                <select
                  id="review-product"
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  className="h-8 px-2 rounded bg-surface-container-lowest border border-outline-variant/60 text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
                >
                  <option value="ALL">All products</option>
                  {productOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => {
                  setSeverityFilter("ALL");
                  setProductFilter("ALL");
                }}
                disabled={!filtersActive}
              >
                Clear filters
              </Button>
            </div>
          ) : null}
        </div>

      <div className="p-space-lg flex flex-col gap-space-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
          {[
            {
              label: "Pending Review",
              value: pending.length,
              unit: "items",
              marker: <span className="w-2 h-2 rounded-full bg-secondary" />,
              valueClass: "text-on-surface",
            },
            {
              label: "High Priority",
              value: highPriority.length,
              unit: "critical",
              marker: <span className="w-2 h-2 rounded-full bg-error" />,
              valueClass: highPriority.length > 0 ? "text-error" : "text-on-surface",
            },
            {
              label: "In Review",
              value: all.filter((task) => task.status === "IN_REVIEW").length,
              unit: "items",
              marker: <span className="w-2 h-2 rounded-full bg-amber-500" />,
              valueClass: "text-on-surface",
            },
            {
              label: "Recently Reviewed",
              value: completed.length,
              unit: "decided",
              marker: <Icon className="text-emerald-600 text-[14px]">check_circle</Icon>,
              valueClass: "text-on-surface",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="p-space-md rounded bg-surface-container-lowest border border-outline-variant/50 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider">
                <span>{card.label}</span>
                {card.marker}
              </div>
              <div className="flex items-baseline justify-between mt-space-xs">
                <span className={`font-headline-lg text-headline-lg font-semibold ${card.valueClass}`}>
                  {card.value}{" "}
                  <span className="font-body-sm text-body-sm font-normal text-on-surface-variant">
                    {card.unit}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-b border-outline-variant/60 flex items-center gap-space-lg overflow-x-auto">
          {tabs.map((item) => {
            const isActive = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setSelectedId(null);
                }}
                aria-current={isActive}
                className={`pb-space-sm font-label-md text-label-md whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? "text-secondary border-b-2 border-secondary font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full font-data-mono text-[10px] ${
                    isActive && item.dot
                      ? "bg-secondary text-on-secondary"
                      : item.key === "HIGH" && item.count > 0
                        ? "bg-error-container text-error"
                        : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-space-xs">
          <div className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm bg-surface-container-lowest border border-outline-variant/50 rounded">
            <div className="relative flex-1 min-w-[240px]">
              <label htmlFor="review-search" className="sr-only">
                Search review items
              </label>
              <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
                search
              </Icon>
              <input
                id="review-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-body-sm font-body-sm bg-surface-container-low rounded border border-transparent focus:border-secondary focus:bg-surface-container-lowest focus:outline-none transition-all placeholder:text-on-surface-variant/60 text-on-surface"
                placeholder="Search product, finding, ingredient..."
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-data-mono text-[11px] text-on-surface-variant">
                {visible.length} shown
              </span>
              <Button
                variant="surface"
                size="sm"
                icon="filter_list"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                title="Filter the queue by severity and product"
              >
                Filter
                {filtersActive ? (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-secondary" aria-hidden="true" />
                ) : null}
              </Button>
            </div>
          </div>
        </div>

        {reviews.status === "loading" ? (
          <LoadingState label="Loading review queue..." rows={6} />
        ) : reviews.status === "error" ? (
          <ErrorState
            title="Unable to load the review queue"
            message={reviews.error.userMessage}
            onRetry={refresh}
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon="task_alt"
            title="No reviews pending"
            description="AI findings requiring human verification will appear here."
            action={
              <Link href="/products">
                <Button variant="primary" icon="inventory_2">
                  Go to products
                </Button>
              </Link>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon="filter_alt_off"
            title="No items in this view"
            description="No review items match the current tab and search."
            action={
              <Button
                variant="outline"
                icon="restart_alt"
                onClick={() => {
                  setTab("ALL");
                  setSearch("");
                }}
              >
                Show all reviews
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col xl:flex-row gap-space-md items-start w-full">
            <div className="w-full xl:w-[62%] flex flex-col gap-space-xs">
              <div className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/40 text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                        <th className="px-space-sm w-16">Priority</th>
                        <th className="px-space-sm">Review Item &amp; Finding</th>
                        <th className="px-space-sm w-36">Product</th>
                        <th className="px-space-xs w-20">Risk</th>
                        <th className="px-space-sm w-28">Evidence</th>
                        <th className="px-space-xs w-28">Assigned</th>
                        <th className="px-space-xs w-24">Requested</th>
                        <th className="px-space-xs w-24">Status</th>
                        <th className="px-space-xs w-12 text-center">
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/30 font-body-sm text-body-sm">
                      {visible.map((task) => {
                        const isSelected = selected?.id === task.id;
                        const sourceCount = evidenceCountFor(task.findingId);
                        return (
                          <tr
                            key={task.id}
                            onClick={() => setSelectedId(task.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-surface-container-low border-l-2 border-secondary"
                                : "hover:bg-surface-container-low/50"
                            }`}
                          >
                            <td className="px-space-xs">
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-data-mono font-semibold ${
                                  task.severity === "HIGH"
                                    ? "bg-red-100 text-red-800 border border-red-200"
                                    : task.severity === "MEDIUM"
                                      ? "bg-amber-100 text-amber-900 border border-amber-200"
                                      : "bg-surface-container text-on-surface-variant border border-outline-variant/50"
                                }`}
                              >
                                {task.severity}
                              </span>
                            </td>
                            <td className="px-space-sm py-2.5">
                              <div className="font-headline-sm text-body-md font-semibold text-on-surface flex items-center gap-1.5">
                                {task.title}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 font-data-mono text-[11px] text-on-surface-variant">
                                <span className="font-semibold text-secondary">{task.id}</span>
                                <span>·</span>
                                <span className="font-data-mono">{task.findingId}</span>
                              </div>
                            </td>
                            <td className="px-space-sm">
                              <div className="font-medium text-on-surface truncate">{task.productName}</div>
                            </td>
                            <td className="px-space-xs">
                              <span
                                className={`font-label-caps text-label-caps font-semibold uppercase ${
                                  task.severity === "HIGH"
                                    ? "text-error"
                                    : task.severity === "MEDIUM"
                                      ? "text-amber-800"
                                      : "text-on-surface-variant"
                                }`}
                              >
                                {task.severity === "MEDIUM" ? "Med" : humanize(task.severity)}
                              </span>
                            </td>
                            <td className="px-space-sm">
                              {sourceCount > 0 ? (
                                <div className="flex items-center gap-1 text-[11px] font-data-mono text-on-surface">
                                  <Icon className="text-[14px] text-secondary">menu_book</Icon>
                                  {sourceCount} source{sourceCount === 1 ? "" : "s"}
                                </div>
                              ) : (
                                <span className="font-data-mono text-[11px] text-on-surface-variant">
                                  None linked
                                </span>
                              )}
                            </td>
                            <td className="px-space-xs">
                              {task.assigneeName ? (
                                <div className="flex items-center gap-1">
                                  <div className="w-4 h-4 rounded-full bg-surface-container-highest text-secondary text-[9px] flex items-center justify-center font-bold">
                                    {task.assigneeName.slice(0, 1).toUpperCase()}
                                  </div>
                                  <span className="text-[11px] text-on-surface truncate">
                                    {task.assigneeName}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-on-surface-variant italic text-[11px]">
                                  Unassigned
                                </span>
                              )}
                            </td>
                            <td className="px-space-xs font-data-mono text-on-surface-variant text-[11px] whitespace-nowrap">
                              {formatDate(task.requestedAt)}
                            </td>
                            <td className="px-space-xs">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                  task.status === "PENDING"
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : task.status === "IN_REVIEW"
                                      ? "bg-blue-50 text-blue-800 border border-blue-200"
                                      : task.status === "APPROVED"
                                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                        : "bg-error-container text-on-error-container border border-error/20"
                                }`}
                              >
                                <span
                                  className={`w-1 h-1 rounded-full ${
                                    task.status === "PENDING"
                                      ? "bg-amber-600"
                                      : task.status === "IN_REVIEW"
                                        ? "bg-blue-600"
                                        : task.status === "APPROVED"
                                          ? "bg-emerald-600"
                                          : "bg-error"
                                  }`}
                                />
                                {humanize(task.status)}
                              </span>
                            </td>
                            <td className="px-space-xs text-center">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedId(task.id);
                                }}
                                aria-label={`Open review ${task.id}`}
                                className="p-1 rounded text-on-surface-variant hover:text-secondary hover:bg-surface-container-highest transition-colors"
                              >
                                <Icon className="text-[16px]">visibility</Icon>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="w-full xl:w-[38%] bg-surface-container-lowest border border-outline-variant/50 rounded flex flex-col">
              {selected ? (
                <>
                  <div className="px-space-md py-space-sm border-b border-outline-variant/40 bg-surface-container-low/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-data-mono text-[11px] font-semibold text-secondary">
                            {selected.id}
                          </span>
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-data-mono font-semibold ${
                              selected.severity === "HIGH"
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : selected.severity === "MEDIUM"
                                  ? "bg-amber-100 text-amber-900 border border-amber-200"
                                  : "bg-surface-container text-on-surface-variant border border-outline-variant/50"
                            }`}
                          >
                            {selected.severity}
                          </span>
                        </div>
                        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold mt-1 leading-tight">
                          {selected.title}
                        </h2>
                        <p className="font-body-sm text-[11px] text-on-surface-variant mt-0.5">
                          {selected.productName} · Finding {selected.findingId}
                        </p>
                      </div>
                      <Link
                        href={`/evidence?finding=${selected.findingId}`}
                        className="p-1.5 rounded text-on-surface-variant hover:text-secondary hover:bg-surface-container-lowest transition-colors shrink-0"
                        aria-label="Open evidence viewer"
                        title="Open in Evidence Viewer"
                      >
                        <Icon className="text-[18px]">open_in_new</Icon>
                      </Link>
                    </div>
                  </div>

                  <div className="p-space-md flex flex-col gap-space-md flex-1 text-body-sm">
                    <div className="flex flex-col gap-space-xs">
                      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider">
                        Review Metadata
                      </div>
                      <div className="p-space-sm bg-surface-container-low rounded border border-outline-variant/40 space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Requested</span>
                          <span className="font-data-mono text-on-surface">
                            {formatDate(selected.requestedAt)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Assignee</span>
                          <span className="text-on-surface">{selected.assigneeName ?? "Unassigned"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-on-surface-variant">Decided</span>
                          <span className="font-data-mono text-on-surface">
                            {formatDate(selected.decidedAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-space-xs">
                      <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                        <Icon className="text-[14px] text-secondary">verified_user</Icon>
                        <span>Official Regulatory Citation</span>
                      </div>
                      {selectedEvidence.length === 0 ? (
                        <div className="p-space-sm bg-surface-container-lowest border border-outline-variant/50 text-[11px] text-on-surface-variant">
                          No statutory evidence has been returned for this finding.
                        </div>
                      ) : (
                        selectedEvidence.map((item) => (
                          <div
                            key={item.id}
                            className="p-space-md rounded bg-surface-container-lowest border border-outline-variant/50 flex flex-col gap-space-xs"
                          >
                            <div className="flex items-center justify-between text-body-sm font-data-mono">
                              <span className="font-semibold text-on-surface">{item.sourceTitle}</span>
                              {item.page ? (
                                <span className="text-on-surface-variant">Page {item.page}</span>
                              ) : null}
                            </div>
                            {item.section ? (
                              <div className="text-[11px] font-data-mono text-secondary">
                                {item.section}
                              </div>
                            ) : null}
                            {item.excerpt ? (
                              <blockquote className="p-space-sm rounded bg-surface-container-low border-l-2 border-secondary font-body-sm text-[12px] text-on-surface italic leading-relaxed">
                                {item.excerpt}
                              </blockquote>
                            ) : null}
                            <Link
                              href={`/evidence?finding=${selected.findingId}`}
                              className="mt-1 flex items-center justify-between p-2 rounded bg-surface-container hover:bg-surface-container-high transition-colors text-secondary text-body-sm font-medium"
                            >
                              <span className="flex items-center gap-1.5">
                                <Icon className="text-[16px]">menu_book</Icon>
                                Open in Statutory Evidence Viewer
                              </span>
                              <Icon className="text-[16px]">arrow_outward</Icon>
                            </Link>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex flex-col gap-space-xs pt-space-xs border-t border-outline-variant/40">
                      <div className="font-label-caps text-label-caps text-on-surface uppercase tracking-wider font-semibold">
                        Reviewer Decision &amp; Audit Rationale
                      </div>
                      {selected.decisionNote ? (
                        <p className="p-space-sm bg-surface-container-lowest border border-outline-variant/50 text-[12px] text-on-surface leading-relaxed">
                          {selected.decisionNote}
                        </p>
                      ) : null}
                      <ReviewDecisionPanel
                        reviewId={selected.id}
                        status={selected.status}
                        findingId={selected.findingId}
                        findingTitle={selected.title}
                        onDecided={refresh}
                      />
                    </div>

                    <details className="group rounded border border-outline-variant/40 bg-surface-container-lowest overflow-hidden">
                      <summary className="flex items-center justify-between p-2.5 cursor-pointer bg-surface-container-low select-none">
                        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                          <Icon className="text-[15px] text-secondary">history</Icon>
                          Audit Trail
                        </span>
                        <Icon className="text-[16px] text-on-surface-variant group-open:rotate-180 transition-transform">
                          expand_more
                        </Icon>
                      </summary>
                      <div className="p-space-sm flex flex-col gap-2 font-data-mono text-[11px] text-on-surface-variant divide-y divide-outline-variant/20">
                        <div className="flex items-start justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1.5 text-on-surface">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                            <span>Finding routed to the review queue</span>
                          </div>
                          <span className="text-on-surface-variant/70">
                            {formatDate(selected.requestedAt)}
                          </span>
                        </div>
                        {selected.decidedAt ? (
                          <div className="flex items-start justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5 text-on-surface">
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  selected.status === "APPROVED" ? "bg-emerald-600" : "bg-error"
                                }`}
                              />
                              <span>Decision recorded: {humanize(selected.status)}</span>
                            </div>
                            <span className="text-on-surface-variant/70">
                              {formatDate(selected.decidedAt)}
                            </span>
                          </div>
                        ) : null}
                        {!selected.decidedAt ? (
                          <div className="flex items-start justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1.5 text-amber-700 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping" />
                              <span>Verification pending definitive sign-off</span>
                            </div>
                            <span className="text-on-surface-variant/70">Open</span>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                </>
              ) : (
                <EmptyState
                  compact
                  icon="rate_review"
                  title="No review selected"
                  description="Select a review item to inspect the finding and record a decision."
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
