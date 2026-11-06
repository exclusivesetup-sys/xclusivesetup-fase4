const API_BASE_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
const TOKEN_STORAGE_KEY =
  import.meta.env.VITE_TOKEN_STORAGE_KEY ||
  (import.meta.env.VITE_APP_ENV === "academico"
    ? "xs_academico_token"
    : "xs_auth_token");

function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    const text = await response.text();
    return text || null;
  }

  return response.json();
}

function createTimeoutSignal(timeout) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeout);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeout);
  return controller.signal;
}

async function apiRequest(path, options = {}) {
  const {
    timeout = 15000,
    headers = {},
    body,
    signal,
    ...restOptions
  } = options;

  const finalHeaders = {
    ...headers,
  };

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  if (body != null && !isFormData && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token && !finalHeaders["Authorization"]) {
    finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...restOptions,
    body,
    headers: finalHeaders,
    signal: signal || createTimeoutSignal(timeout),
  });

  if (response.status === 401 && path !== "/api/auth/login") {
    clearToken();
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      data?.error ||
      (typeof data === "string" && data) ||
      `HTTP ${response.status}`;

    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function mensajeDeError(err, mensajePorDefecto) {
  if (err?.status === 403 && err?.message) {
    return err.message;
  }
  return mensajePorDefecto;
}

export { API_BASE_URL, apiRequest, getToken, setToken, clearToken, mensajeDeError };