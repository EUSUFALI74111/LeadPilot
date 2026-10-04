export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Envelope<T> = { data: T; meta: Record<string, unknown> };
let csrfToken = "";
let refreshPromise: Promise<void> | null = null;

function cookie(name: string): string {
  if (typeof document === "undefined") return "";
  const part = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

async function parse<T>(response: Response): Promise<Envelope<T>> {
  const payload = (await response.json().catch(() => null)) as
    Envelope<T> | { error?: { message?: string; details?: Record<string, unknown> } } | null;
  if (!response.ok) {
    const error = payload && "error" in payload ? payload.error : undefined;
    throw new ApiError(
      error?.message ?? "The request could not be completed.",
      response.status,
      error?.details,
    );
  }
  return payload as Envelope<T>;
}

async function refreshSession(): Promise<void> {
  const response = await fetch("/api/auth/refresh.php", {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const payload = await parse<{ csrfToken?: string }>(response);
  csrfToken = payload.data.csrfToken ?? cookie("lp_csrf");
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Envelope<T>> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = csrfToken || cookie("lp_csrf");
    if (token) headers.set("X-CSRF-Token", token);
  }
  const response = await fetch(`/api/${path}`, {
    ...init,
    method,
    headers,
    credentials: "include",
  });
  if (
    response.status === 401 &&
    retry &&
    !path.startsWith("auth/login") &&
    !path.startsWith("auth/refresh")
  ) {
    refreshPromise ??= refreshSession().finally(() => {
      refreshPromise = null;
    });
    try {
      await refreshPromise;
      return api<T>(path, init, false);
    } catch {
      // Preserve the original authentication error.
    }
  }
  const payload = await parse<T>(response);
  if (payload.data && typeof payload.data === "object" && "csrfToken" in payload.data) {
    csrfToken = String((payload.data as { csrfToken?: string }).csrfToken ?? "");
  }
  return payload;
}

export const jsonBody = (value: unknown) => JSON.stringify(value);
export const clearApiSession = () => {
  csrfToken = "";
};
