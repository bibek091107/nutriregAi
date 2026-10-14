"use client";

import { Icon } from "@/components/ui/Icon";
import { stagePresentation } from "@/lib/presentation";
import type { WorkflowStage } from "@/lib/api/types";

/**
 * Nine-stage regulatory workflow stepper from the Products & Workflows design.
 * Stage state comes from the backend; no stage is marked complete locally.
 */
export function WorkflowStepper({
  stages,
  compact = false,
}: {
  stages: WorkflowStage[];
  compact?: boolean;
}) {
  if (stages.length === 0) {
    return (
      <p className="font-body-md text-body-md text-on-surface-variant">
        Workflow stages are reported by the backend once a product dossier exists.
      </p>
    );
  }

  const completed = stages.filter((stage) => stage.state === "COMPLETED").length;

  return (
    <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between text-label-caps font-label-caps uppercase tracking-wider text-on-surface-variant">
        <span>Workflow Stages</span>
        <span className="font-data-mono font-medium text-secondary">
          {completed} / {stages.length} Completed
        </span>
      </div>
      <div className="flex flex-col gap-1.5 mt-1 bg-surface-container-low/50 p-2.5 rounded">
        {stages.map((stage, index) => {
          const presentation = stagePresentation(stage.state);
          const isActive = stage.state === "ACTIVE";
          return (
            <div
              key={stage.key}
              className={`flex items-center justify-between text-body-sm font-body-sm ${
                isActive
                  ? "bg-surface-container-high px-2 py-1.5 rounded -mx-1 text-secondary font-medium"
                  : stage.state === "COMPLETED"
                    ? "text-on-surface"
                    : "text-on-surface-variant/70 opacity-80"
              }`}
            >
              <div className="flex items-center gap-2">
                {isActive ? (
                  <span className="w-2 h-2 rounded-full bg-secondary ring-2 ring-surface-container-lowest" />
                ) : (
                  <Icon className={`text-[16px] ${presentation.iconClass}`}>
                    {presentation.icon}
                  </Icon>
                )}
                <span>
                  {index + 1}. {stage.label}
                </span>
              </div>
              <span
                className={`font-data-mono text-[10px] ${
                  isActive
                    ? "bg-surface-container px-1 rounded font-semibold text-secondary"
                    : stage.state === "COMPLETED"
                      ? "uppercase"
                      : ""
                }`}
              >
                {isActive ? "ACTIVE" : presentation.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Compact horizontal progress bar shown in the products table's Stage column. */
export function StageProgress({ stages }: { stages: WorkflowStage[] }) {
  if (stages.length === 0) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-on-surface-variant">Unknown</span>
          <span className="font-data-mono text-on-surface-variant">—</span>
        </div>
        <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
          <div className="bg-outline h-full rounded-full" style={{ width: "0%" }} />
        </div>
      </div>
    );
  }

  const completed = stages.filter((stage) => stage.state === "COMPLETED").length;
  const activeIndex = stages.findIndex((stage) => stage.state === "ACTIVE");
  const percent = Math.round((completed / stages.length) * 100);
  const label = activeIndex >= 0 ? stages[activeIndex].label : "Completed";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-on-surface truncate">{label}</span>
        <span className="font-data-mono text-on-surface-variant">
          {completed}/{stages.length}
        </span>
      </div>
      <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            percent === 100 ? "bg-on-tertiary-container" : percent === 0 ? "bg-outline" : "bg-secondary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
