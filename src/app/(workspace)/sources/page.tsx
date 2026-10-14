"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useResource } from "@/lib/hooks/useResource";
import { getStatutorySources } from "@/lib/api";
import { humanize, formatDate } from "@/lib/format";
import type { StatutorySource } from "@/lib/api/types";

type SourceCategory = "ALL" | "ACT" | "REGULATION" | "GUIDANCE" | "STANDARD" | "NOTIFICATION";

const CATEGORIES: { value: SourceCategory; label: string }[] = [
  { value: "ALL", label: "All Sources" },
  { value: "ACT", label: "Acts" },
  { value: "REGULATION", label: "Regulations" },
  { value: "GUIDANCE", label: "Guidance" },
  { value: "STANDARD", label: "Standards" },
  { value: "NOTIFICATION", label: "Notifications & Advisories" },
];

/**
 * Statutory Sources ledger + inspector drawer.
 *
 * This page deliberately renders nothing but backend records: when the
 * regulatory knowledge base is empty or not connected, the designed
 * "No statutory sources available" state is shown instead of example gazettes.
 */
export default function SourcesPage() {
  const sources = useResource<StatutorySource[]>(
    (signal) => getStatutorySources(signal),
    [],
  );

  const [category, setCategory] = useState<SourceCategory>("ALL");
  const [search, setSearch] = useState("");
  const [authority, setAuthority] = useState("ALL");
  const [jurisdiction, setJurisdiction] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(() => sources.data ?? [], [sources.data]);

  const authorities = useMemo(
    () => Array.from(new Set(all.map((s) => s.authority).filter(Boolean))).sort(),
    [all],
  );
  const jurisdictions = useMemo(
    () =>
      Array.from(
        new Set(
          all
            .map((s) => s.jurisdiction)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort(),
    [all],
  );

  const counts = useMemo(() => {
    const base: Record<string, number> = { ALL: all.length };
    for (const source of all) {
      if (source.sourceType) base[source.sourceType] = (base[source.sourceType] ?? 0) + 1;
    }
    return base;
  }, [all]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return all.filter((source) => {
      if (category !== "ALL" && source.sourceType !== category) return false;
      if (authority !== "ALL" && source.authority !== authority) return false;
      if (jurisdiction !== "ALL" && source.jurisdiction !== jurisdiction) return false;
      if (!term) return true;
      return (
        source.title.toLowerCase().includes(term) ||
        source.documentTitle?.toLowerCase().includes(term) ||
        source.id.toLowerCase().includes(term) ||
        source.authority.toLowerCase().includes(term)
      );
    });
  }, [all, category, authority, jurisdiction, search]);

  const selected = useMemo(
    () => visible.find((source) => source.id === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  const jurisdictionCount = new Set(all.map((s) => s.jurisdiction).filter(Boolean)).size;
  const latestIndex = all
    .map((s) => s.lastIndexedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const clearFilters = () => {
    setCategory("ALL");
    setSearch("");
    setAuthority("ALL");
    setJurisdiction("ALL");
  };

  return (
    <div className="flex flex-col w-full">
      <div className="flex flex-col gap-space-sm mb-space-lg">
        <div className="flex items-center justify-between">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md"
          >
            <span className="hover:text-secondary cursor-pointer transition-colors">Products</span>
            <Icon className="text-[14px]">chevron_right</Icon>
            <span className="hover:text-secondary cursor-pointer transition-colors">
              Regulatory Knowledge
            </span>
            <Icon className="text-[14px]">chevron_right</Icon>
            <span className="text-on-surface font-semibold">Statutory Sources</span>
          </nav>
          {all.length > 0 ? (
            <div className="hidden sm:flex items-center gap-space-sm">
              <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface font-data-mono text-data-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                <span>Knowledge base connected</span>
              </div>
              <span className="font-data-mono text-data-mono text-on-surface-variant">
                {all.length} Active Sources | {authorities.length} Authorities
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pt-space-xs">
          <div>
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none">
              Statutory Sources
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1.5">
              Browse, verify, and inspect the official regulatory gazettes, acts, and standards
              powering NutriReg AI&apos;s compliance engine.
            </p>
          </div>
          <div className="flex items-center gap-space-sm shrink-0">
            <Button variant="outline" icon="sync" onClick={sources.refetch}>
              Refresh Sources
            </Button>
            <Button
              variant="solid"
              icon="add"
              disabled
              title="Source ingestion is performed by the backend knowledge-base sync"
            >
              + Add Source
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md mb-space-lg">
        {[
          {
            label: "Active Sources",
            value: all.length,
            note: `Across ${jurisdictionCount} jurisdiction${jurisdictionCount === 1 ? "" : "s"}`,
            icon: "library_books",
          },
          {
            label: "Authorities",
            value: authorities.length,
            note: authorities.length > 0 ? authorities.slice(0, 2).join(", ") : "Reported by the backend",
            icon: "account_balance",
          },
          {
            label: "Indexed Citations",
            value: all.reduce((sum, source) => sum + (source.citationCount ?? 0), 0),
            note: "Links from findings and evidence",
            icon: "link",
          },
          {
            label: "Last Indexed",
            value: latestIndex ? formatDate(latestIndex) : "—",
            note: latestIndex ? "Most recent source sync" : "No sources indexed",
            icon: "update",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-surface-container-lowest rounded p-space-md shadow-sm flex flex-col justify-between"
          >
            <div className="flex items-center justify-between">
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                {card.label}
              </span>
              <Icon className="text-[18px] text-secondary">{card.icon}</Icon>
            </div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap">
              <span className="font-headline-lg text-headline-lg font-semibold text-on-surface">
                {card.value}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{card.note}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-outline-variant/40 mb-space-md overflow-x-auto select-none">
        {CATEGORIES.map((item) => {
          const isActive = category === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              aria-current={isActive}
              className={`px-space-md py-2 font-label-md text-label-md shrink-0 flex items-center gap-1.5 transition-colors ${
                isActive
                  ? "border-b-2 border-secondary text-secondary font-semibold"
                  : "border-b-2 border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full font-data-mono text-[11px] ${
                  isActive ? "bg-secondary/10" : "bg-surface-container-low"
                }`}
              >
                {counts[item.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {all.length > 0 ? (
        <div className="bg-surface-container-lowest rounded p-space-sm shadow-sm mb-space-md flex flex-col lg:flex-row items-center justify-between gap-space-sm">
          <div className="relative w-full lg:w-96">
            <label htmlFor="source-search" className="sr-only">
              Search statutory sources
            </label>
            <Icon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </Icon>
            <input
              id="source-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full h-8 pl-8 pr-3 text-body-sm font-body-sm rounded bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:bg-surface-container-lowest"
              placeholder="Search regulations, guidance, authority, document title..."
            />
          </div>
          <div className="flex items-center gap-space-sm w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
            <div className="flex items-center gap-1.5">
              <label htmlFor="source-jurisdiction" className="font-label-caps text-label-caps text-on-surface-variant uppercase shrink-0">
                Jurisdiction:
              </label>
              <select
                id="source-jurisdiction"
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
                className="h-8 px-2 text-body-sm font-body-sm rounded bg-surface-container-low text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Jurisdictions</option>
                {jurisdictions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="source-authority" className="font-label-caps text-label-caps text-on-surface-variant uppercase shrink-0">
                Authority:
              </label>
              <select
                id="source-authority"
                value={authority}
                onChange={(event) => setAuthority(event.target.value)}
                className="h-8 px-2 text-body-sm font-body-sm rounded bg-surface-container-low text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Authorities</option>
                {authorities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-4 w-px bg-surface-container-high mx-1" />
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </div>
      ) : null}

      {sources.status === "loading" ? (
        <LoadingState label="Loading statutory sources..." rows={6} />
      ) : sources.status === "error" ? (
        <ErrorState
          title="Unable to load regulatory sources"
          message={sources.error.userMessage}
          onRetry={sources.refetch}
        />
      ) : all.length === 0 ? (
        <EmptyState
          icon="library_books"
          title="No statutory sources available"
          description="The regulatory knowledge base is not connected. Once the backend indexes official gazettes, acts, and standards they will appear here automatically."
          action={
            <Button variant="outline" icon="sync" onClick={sources.refetch}>
              Check again
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          compact
          icon="filter_alt_off"
          title="No matching sources"
          description="No statutory sources match the current filters."
          action={
            <Button variant="outline" icon="restart_alt" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-md items-start">
          <div className="xl:col-span-7 bg-surface-container-lowest rounded shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-caps text-label-caps uppercase tracking-wider h-9">
                    <th className="py-2 px-space-md font-semibold">Statutory Source &amp; Identifier</th>
                    <th className="py-2 px-space-sm font-semibold">Authority &amp; Jurisdiction</th>
                    <th className="py-2 px-space-sm font-semibold">Type &amp; Version</th>
                    <th className="py-2 px-space-sm font-semibold text-center">Cited</th>
                    <th className="py-2 px-space-sm font-semibold text-center">Updated</th>
                    <th className="py-2 px-space-md font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">
                  {visible.map((source) => {
                    const isSelected = selected?.id === source.id;
                    return (
                      <tr
                        key={source.id}
                        onClick={() => setSelectedId(source.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? "bg-secondary/5 font-medium"
                            : "hover:bg-surface-container-low/60"
                        }`}
                      >
                        <td className="py-3 px-space-md">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-8 rounded-full ${
                                isSelected ? "bg-secondary" : "bg-transparent group-hover:bg-outline-variant"
                              }`}
                            />
                            <div className="min-w-0">
                              <div className="text-on-surface font-semibold flex items-center gap-1.5">
                                <span className="truncate">{source.title}</span>
                                {source.sourceUrl ? (
                                  <Icon className="text-[14px] text-secondary shrink-0">verified</Icon>
                                ) : null}
                              </div>
                              <span className="font-data-mono text-[11px] text-on-surface-variant">
                                {source.id}
                                {source.documentTitle ? ` · ${source.documentTitle}` : ""}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-space-sm">
                          <div className="text-on-surface font-medium">{source.authority}</div>
                          <span className="text-[11px] text-on-surface-variant">
                            {source.jurisdiction ?? "—"}
                          </span>
                        </td>
                        <td className="py-3 px-space-sm">
                          <span className="font-label-sm text-label-sm text-on-surface">
                            {source.sourceType ? humanize(source.sourceType) : "—"}
                          </span>
                          <div className="font-data-mono text-[11px] text-on-surface-variant">
                            {source.version ?? "—"}
                          </div>
                        </td>
                        <td className="py-3 px-space-sm text-center font-data-mono text-[11px] text-on-surface-variant">
                          {source.citationCount}
                        </td>
                        <td className="py-3 px-space-sm text-center font-data-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                          {formatDate(source.lastIndexedAt)}
                        </td>
                        <td className="py-3 px-space-md text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(source.id);
                            }}
                            aria-label={`Inspect ${source.title}`}
                            className={`p-1 rounded transition-colors ${
                              isSelected
                                ? "hover:bg-surface-container text-secondary"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                            }`}
                          >
                            <Icon className="text-[18px]">
                              {isSelected ? "visibility" : "chevron_right"}
                            </Icon>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-space-md py-2 border-t border-outline-variant/30 flex items-center justify-between">
              <span className="font-data-mono text-[11px] text-on-surface-variant">
                {visible.length} of {all.length} sources
              </span>
              <span className="font-data-mono text-[11px] text-on-surface-variant">Page 1 of 1</span>
            </div>
          </div>

          <div className="xl:col-span-5 bg-surface-container-lowest rounded shadow-sm flex flex-col overflow-hidden sticky top-20">
            {selected ? (
              <>
                <div className="p-space-md bg-surface-container-low/80 flex items-start justify-between">
                  <div className="flex flex-col min-w-0 pr-space-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-label-caps text-label-caps uppercase text-secondary font-bold tracking-wider">
                        Statutory Source
                      </span>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        ID: {selected.id}
                      </span>
                    </div>
                    <h2 className="font-headline-lg text-headline-lg text-on-surface mt-1">
                      {selected.title}
                    </h2>
                    <div className="flex items-center gap-space-xs mt-1 text-on-surface-variant font-body-sm text-body-sm">
                      <span>{selected.authority}</span>
                      <span>·</span>
                      <span className="font-data-mono text-data-mono">
                        {selected.jurisdiction ?? "Jurisdiction not recorded"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selected.sourceUrl ? (
                      <a
                        href={selected.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Open Official Source"
                        className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
                      >
                        <Icon className="text-[18px]">open_in_new</Icon>
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="px-space-md py-space-sm bg-surface-container-high/40 flex items-center justify-between border-b border-outline-variant/30">
                  <div className="flex items-center gap-2">
                    <Icon className="text-secondary text-[20px]">verified</Icon>
                    <div className="flex flex-col">
                      <span className="font-label-md text-label-md font-semibold text-secondary leading-tight">
                        Indexed for NutriReg AI Retrieval
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Grounding status is reported by the backend
                      </span>
                    </div>
                  </div>
                  <span className="font-data-mono text-data-mono bg-surface-container-lowest text-secondary px-2 py-0.5 rounded font-bold shadow-sm border border-outline-variant/40">
                    {selected.lastIndexedAt ? "Synced" : "Unindexed"}
                  </span>
                </div>

                <div className="p-space-md space-y-space-md overflow-y-auto">
                  <div className="p-space-md rounded bg-surface-container-low flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 text-on-surface">
                      <Icon className="text-[16px] text-secondary">account_balance</Icon>
                      <span className="font-label-caps text-label-caps uppercase font-bold tracking-wider">
                        Source Metadata &amp; Authority
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-space-md gap-y-2 font-body-sm text-body-sm">
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Authority
                        </span>
                        <span className="text-on-surface font-medium">{selected.authority}</span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Jurisdiction
                        </span>
                        <span className="text-on-surface font-medium">
                          {selected.jurisdiction ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Document Type
                        </span>
                        <span className="text-on-surface font-medium">
                          {selected.sourceType ? humanize(selected.sourceType) : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Document Title
                        </span>
                        <span className="text-on-surface font-medium">
                          {selected.documentTitle ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Baseline Version
                        </span>
                        <span className="font-data-mono text-[11px] text-on-surface font-medium">
                          {selected.version ?? "—"}
                        </span>
                      </div>
                      <div>
                        <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                          Effective Date
                        </span>
                        <span className="text-on-surface font-medium">
                          {formatDate(selected.effectiveDate)}
                        </span>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-outline-variant/30 flex items-center justify-between font-data-mono text-[11px]">
                        <span className="text-on-surface-variant">
                          Last Indexed: {formatDate(selected.lastIndexedAt)}
                        </span>
                        {selected.sourceUrl ? (
                          <a
                            href={selected.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-secondary hover:underline flex items-center gap-0.5"
                          >
                            Open official source
                            <Icon className="text-[12px]">open_in_new</Icon>
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="font-label-caps text-label-caps text-on-surface-variant uppercase block mb-1.5 font-bold tracking-wider">
                      Connected Usage in Workspaces
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          label: "Citations",
                          value: selected.citationCount,
                          icon: "link",
                        },
                        {
                          label: "Last Indexed",
                          value: formatDate(selected.lastIndexedAt),
                          icon: "update",
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="p-space-sm rounded bg-surface-container-low flex items-center justify-between"
                        >
                          <div>
                            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase block">
                              {stat.label}
                            </span>
                            <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                                {stat.value ?? "—"}
                            </span>
                          </div>
                          <Icon className="text-[20px] text-secondary">{stat.icon}</Icon>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-space-md rounded bg-surface-container-low flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-on-surface">
                        <Icon className="text-[16px] text-secondary">segment</Icon>
                        <span className="font-label-caps text-label-caps uppercase font-bold tracking-wider">
                          Indexed Sections
                        </span>
                      </div>
                      <span className="font-data-mono text-[11px] text-on-surface-variant">
                        Reported by RAG index
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Individual clause text is returned by the backend retrieval service. Open the
                      Evidence Viewer to inspect excerpts attached to specific findings.
                    </p>
                    <Link href="/evidence" className="w-full">
                      <Button variant="outline" icon="policy" className="w-full">
                        Open Evidence Viewer
                      </Button>
                    </Link>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                compact
                icon="library_books"
                title="No source selected"
                description="Select a statutory source to inspect its metadata."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
