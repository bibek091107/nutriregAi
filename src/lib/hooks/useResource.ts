"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";

export type AsyncState<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "empty"; data: T; error: null }
  | { status: "error"; data: null; error: ApiError };

interface UseResourceOptions<T> {
  /** Return true when the loaded payload should render as an empty state. */
  isEmpty?: (data: T) => boolean;
  /** Skip fetching until a dependency (e.g. a route id) is available. */
  enabled?: boolean;
}

const isCollection = (value: unknown): value is unknown[] => Array.isArray(value);

/**
 * Loads a backend resource and maps it onto the state set the design already
 * covers: loading, success, empty, and error. Errors are surfaced as values so
 * no screen needs try/catch, and no placeholder records are ever substituted.
 */
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  options: UseResourceOptions<T> = {},
): AsyncState<T> & { refetch: () => void } {
  const { isEmpty, enabled = true } = options;

  const [state, setState] = useState<AsyncState<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState({ status: "loading", data: null, error: null });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: "loading", data: null, error: null });

    loaderRef.current(controller.signal).then(
      (data) => {
        if (!active) return;
        const empty =
          options.isEmpty?.(data) ?? (isCollection(data) && data.length === 0);
        setState({ status: empty ? "empty" : "success", data, error: null });
      },
      (error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error:
            error instanceof ApiError
              ? error
              : new ApiError("network", "Unexpected failure while loading data."),
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  return { ...state, refetch };
}
