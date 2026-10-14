/**
 * Single source of truth for backend configuration and transport.
 *
 * In production with Vercel services, `NEXT_PUBLIC_API_URL` is not set and the
 * client issues same-origin requests (e.g. `/api/v1/products`). The Vercel
 * rewrite layer routes `/api/*` to the backend service.
 *
 * For local development without `vercel dev`, set `NEXT_PUBLIC_API_URL` to the
 * backend's address (e.g. `http://localhost:8000`).
 */

export const API_BASE_URL = (
  (typeof window === "undefined" ? process.env.BACKEND_URL : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  ""
).replace(/\/+$/, "");

/** Upload ceiling enforced client-side before any request is issued. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  "pdf",
  "docx",
  "xlsx",
  "png",
  "jpg",
  "jpeg",
] as const;

export const ACCEPTED_UPLOAD_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
] as const;

export const ACCEPT_ATTRIBUTE = ".pdf,.docx,.xlsx,.png,.jpg,.jpeg";

export type ApiFailureKind =
  | "not-configured"
  | "network"
  | "not-found"
  | "client"
  | "server"
  | "parse"
  | "aborted";

/**
 * A failed API call is a value, not an exception, so every screen can render a
 * designed error state without try/catch duplication.
 */
export class ApiError extends Error {
  readonly kind: ApiFailureKind;
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }

  /** Copy shown to operators; raw transport details never reach the UI. */
  get userMessage(): string {
    switch (this.kind) {
      case "not-configured":
        return "Backend unavailable. Set NEXT_PUBLIC_API_URL to connect the NutriReg API.";
      case "network":
        return "Backend unavailable. The NutriReg API could not be reached.";
      case "not-found":
        return "The requested record no longer exists.";
      case "client":
        return "The request was rejected. Check the submitted values and try again.";
      case "server":
        return "The NutriReg API returned an error. Try again in a moment.";
      case "parse":
        return "The NutriReg API returned an unexpected response.";
      default:
        return "The request was cancelled.";
    }
  }
}

export const isNotConfigured = (error: unknown): boolean =>
  error instanceof ApiError && error.kind === "not-configured";

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Required for multipart uploads, where the browser sets the boundary. */
  formData?: FormData;
  /** Query parameters; empty values are omitted. */
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined | null>): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return `${API_BASE_URL}${normalized}${qs ? `?${qs}` : ""}`;
}

/** Performs one request against the configured backend. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {

  const { method = "GET", body, signal, formData, query } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      signal,
      cache: "no-store",
      // `include` ensures the session cookie is sent on both same-origin
      // (Vercel services) and cross-origin (local dev with separate backend)
      // requests.
      credentials: "include",
      headers: formData
        ? undefined
        : body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("aborted", "Request aborted.");
    }
    throw new ApiError("network", "Network request failed.");
  }

  if (response.status === 404) {
    throw new ApiError("not-found", "Not found.", 404);
  }
  if (response.status >= 500) {
    throw new ApiError("server", "Server error.", response.status);
  }
  if (!response.ok) {
    throw new ApiError("client", "Request rejected.", response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("parse", "Malformed response body.");
  }
}

/** Uploads a file with real progress via XHR, since fetch cannot report progress. */
export function uploadWithProgress(
  path: string,
  file: File,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<unknown> {

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildUrl(path));
    xhr.responseType = "text";
    // Ensures the session cookie is sent on both same-origin (Vercel services)
    // and cross-origin (local dev with separate backend) uploads.
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : undefined);
        } catch {
          resolve(undefined);
        }
        return;
      }
      reject(
        xhr.status === 404
          ? new ApiError("not-found", "Not found.", 404)
          : xhr.status >= 500
            ? new ApiError("server", "Server error.", xhr.status)
            : new ApiError("client", "Upload rejected.", xhr.status),
      );
    };
    xhr.onerror = () => reject(new ApiError("network", "Upload failed."));
    xhr.onabort = () => reject(new ApiError("aborted", "Upload aborted."));

    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function validateUpload(file: File): string | null {
  const name = file.name.toLowerCase();
  const extension = name.split(".").pop() ?? "";
  const hasAcceptedExtension = (ACCEPTED_UPLOAD_EXTENSIONS as readonly string[]).includes(extension);
  const hasAcceptedMime = (ACCEPTED_UPLOAD_MIME as readonly string[]).includes(file.type);

  if (!hasAcceptedExtension && !hasAcceptedMime) {
    return "Unsupported file type. Upload a PDF, DOCX, XLSX, PNG, or JPG file.";
  }
  if (file.size === 0) {
    return "The selected file is empty.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB upload limit.`;
  }
  return null;
}
