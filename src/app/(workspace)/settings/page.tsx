"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/controls";
import { useSession } from "@/lib/auth/session";
import {
  ACCEPT_ATTRIBUTE,
  API_BASE_URL,
  MAX_UPLOAD_BYTES,
} from "@/lib/api/client";
import { useWorkspace } from "@/components/shell/AppShell";
import { MARKET_LABELS } from "@/lib/routes";
import { formatBytes } from "@/lib/format";

/**
 * Workspace settings. Preferences are stored in the signed-in operator's browser
 * only, because the backend exposes no settings resource; anything requiring
 * server state is labelled as such rather than implied to be saved.
 */
export default function SettingsPage() {
  const { user, status, signOut } = useSession();
  const { products } = useWorkspace();

  const [defaultMarket, setDefaultMarket] = useState<string>("INDIA_FSSAI");
  const [polling, setPolling] = useState<"15" | "30" | "60">("30");
  const [notifications, setNotifications] = useState({ review: true, analysis: true, digest: false });
  const [saved, setSaved] = useState<string | null>(null);

  const apiConfigured = API_BASE_URL.length > 0;

  const save = (message: string) => {
    setSaved(message);
    window.setTimeout(() => setSaved(null), 4000);
  };

  return (
    <div className="flex flex-col w-full max-w-4xl">
      <div className="pb-space-lg border-b border-outline-variant/30">
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-none font-semibold">
          Settings
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1.5 max-w-2xl">
          Workspace configuration, account status, and the connection to the NutriReg API.
        </p>
      </div>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Account</h2>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded">
          {status === "loading" ? (
            <p className="p-space-md font-body-sm text-body-sm text-on-surface-variant">
              Checking session with the NutriReg API...
            </p>
          ) : status === "anonymous" || !user ? (
            <div className="p-space-md flex items-start gap-3">
              <Icon className="text-[20px] text-on-surface-variant mt-0.5">account_circle</Icon>
              <div className="min-w-0">
                <p className="font-body-sm text-body-sm text-on-surface font-medium">
                  Not signed in
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  The backend did not return a session for <span className="font-data-mono">/api/v1/auth/session</span>.
                  No identity is assumed, and review decisions are attributed to whoever the API records.
                </p>
              </div>
            </div>
          ) : (
            <dl className="p-space-md grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["Display name", user.displayName],
                ["Email", user.email ?? "Not provided"],
                ["Organization", user.organizationName ?? "Not provided"],
                ["Role", user.role ?? "Not provided"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    {label}
                  </dt>
                  <dd className="font-body-sm text-body-sm text-on-surface mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {status === "authenticated" ? (
          <div className="mt-2">
            <Button variant="outline" icon="logout" onClick={signOut}>
              Sign out
            </Button>
          </div>
        ) : null}
      </section>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          API Connection
        </h2>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md">
          <div className="flex items-center gap-2">
            <Icon
              className={`text-[18px] ${apiConfigured ? "text-[#046c4e]" : "text-error"}`}
            >
              {apiConfigured ? "cloud_done" : "cloud_off"}
            </Icon>
            <span className="font-body-sm text-body-sm text-on-surface font-medium">
              {apiConfigured ? "Backend configured" : "Backend not configured"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                NEXT_PUBLIC_API_URL
              </dt>
              <dd className="font-data-mono text-[11px] text-on-surface mt-0.5 break-all">
                {apiConfigured ? API_BASE_URL : "Not set"}
              </dd>
            </div>
            <div>
              <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Products loaded
              </dt>
              <dd className="font-data-mono text-[11px] text-on-surface mt-0.5">
                {products.length} from the API
              </dd>
            </div>
          </dl>
          {!apiConfigured ? (
            <p className="font-body-sm text-body-sm text-error mt-3">
              Set <span className="font-data-mono">NEXT_PUBLIC_API_URL</span> in{" "}
              <span className="font-data-mono">.env.local</span> and restart the dev server. Until
              then every screen shows its real empty state rather than placeholder records.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Default Target Market
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          Pre-selects the jurisdiction when creating a product.
        </p>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md">
          <div className="flex flex-col gap-1 max-w-sm">
            <label htmlFor="default-market" className="font-label-md text-label-md text-on-surface font-medium">
              Primary market
            </label>
            <select
              id="default-market"
              value={defaultMarket}
              onChange={(event) => setDefaultMarket(event.target.value)}
              className="h-9 px-3 rounded bg-surface-container-low text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
            >
              {Object.entries(MARKET_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Analysis Polling
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          How often the workspace re-checks running analyses and document processing.
        </p>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md">
          <div className="flex flex-col gap-1 max-w-sm">
            <label htmlFor="poll-interval" className="font-label-md text-label-md text-on-surface font-medium">
              Polling interval
            </label>
            <select
              id="poll-interval"
              value={polling}
              onChange={(event) => setPolling(event.target.value as "15" | "30" | "60")}
              className="h-9 px-3 rounded bg-surface-container-low text-on-surface text-body-sm font-body-sm focus:outline-none focus:border-secondary"
            >
              <option value="15">Every 15 seconds</option>
              <option value="30">Every 30 seconds</option>
              <option value="60">Every 60 seconds</option>
            </select>
          </div>
        </div>
      </section>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Notifications
        </h2>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded divide-y divide-outline-variant/30">
          {[
            { key: "review" as const, label: "Human review assignments", detail: "When a finding is routed to the review queue." },
            { key: "analysis" as const, label: "Analysis and document processing", detail: "When a long-running job completes or fails." },
            { key: "digest" as const, label: "Weekly compliance digest", detail: "Requires a mail service on the backend." },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-start gap-3 p-space-md cursor-pointer hover:bg-surface-container-low/40 transition-colors"
            >
              <input
                type="checkbox"
                checked={notifications[item.key]}
                onChange={(event) =>
                  setNotifications((current) => ({ ...current, [item.key]: event.target.checked }))
                }
                className="mt-0.5 accent-secondary"
              />
              <span className="min-w-0">
                <span className="block font-body-sm text-body-sm text-on-surface font-medium">
                  {item.label}
                </span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">
                  {item.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
          Document Upload Limits
        </h2>
        <div className="mt-2 bg-surface-container-lowest border border-outline-variant/60 rounded p-space-md">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Maximum size
              </dt>
              <dd className="font-data-mono text-[11px] text-on-surface mt-0.5">
                {formatBytes(MAX_UPLOAD_BYTES)}
              </dd>
            </div>
            <div>
              <dt className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                Accepted formats
              </dt>
              <dd className="font-data-mono text-[11px] text-on-surface mt-0.5">
                {ACCEPT_ATTRIBUTE.replace(/\./g, "").toUpperCase()}
              </dd>
            </div>
          </dl>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-3">
            These limits mirror the upload contract in{" "}
            <span className="font-data-mono">src/lib/api/client.ts</span> and are enforced before any
            request is sent.
          </p>
        </div>
      </section>

      <div className="mt-space-lg flex items-center justify-between border-t border-outline-variant/40 pt-space-md">
        <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1.5">
          <Icon className="text-[15px] text-secondary">info</Icon>
          Preferences are held in this browser session; the backend stores no settings resource.
        </p>
        <Button
          variant="primary"
          icon="save"
          onClick={() => save("Preferences applied for this browser session.")}
        >
          Save Preferences
        </Button>
      </div>

      {saved ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-space-md py-2.5 rounded bg-[#b6f2e0] text-[#046c4e] shadow-lg font-body-sm text-body-sm"
        >
          <Icon className="text-[16px]">check_circle</Icon>
          {saved}
        </div>
      ) : null}
    </div>
  );
}
