import type {
  RepairQueryResponse,
  Session,
  SessionDetail,
  TokenResponse,
  UserOut,
} from "@/types/repair";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "repair_rag_token";

// ── Token storage — SSR safe ──────────────────────────────────────────────────
export const tokenStore = {
  get: (): string | null => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  set: (token: string): void => {
    if (typeof window === "undefined") return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear: (): void => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(TOKEN_KEY);
  },
};

// ── Base fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  skipAuth = false
): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers ?? {});

  if (token && !skipAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiError(response.status, error.detail ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string) =>
    apiFetch<TokenResponse>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
        headers: { "Content-Type": "application/json" },
      },
      true
    ),

  login: (email: string, password: string) =>
    apiFetch<TokenResponse>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
        headers: { "Content-Type": "application/json" },
      },
      true
    ),

  me: () => apiFetch<UserOut>("/auth/me"),
};

// ── Repair ────────────────────────────────────────────────────────────────────
export const repairApi = {
  query: (params: {
    text_query: string;
    image?: File | null;
    session_id?: string | null;
    device_type?: string | null;
  }) => {
    const form = new FormData();
    form.append("text_query", params.text_query);
    if (params.image) form.append("image", params.image);
    if (params.session_id) form.append("session_id", params.session_id);
    if (params.device_type) form.append("device_type", params.device_type);

    return apiFetch<RepairQueryResponse>("/repair/query", {
      method: "POST",
      body: form,
    });
  },

  listSessions: (limit = 20, offset = 0) =>
    apiFetch<Session[]>(`/repair/sessions?limit=${limit}&offset=${offset}`),

  getSession: (sessionId: string) =>
    apiFetch<SessionDetail>(`/repair/sessions/${sessionId}`),
};