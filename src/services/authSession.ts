import type { LoginResponse } from "../shared/types/domain";

const AUTH_TOKEN_KEY = "kb_access_token";
const AUTH_USER_KEY = "kb_user";
const AUTH_SESSION_KEY = "kb_session";
export const AUTH_REQUIRED_EVENT = "kb:auth-required";

export function saveAuthSession(loginData: LoginResponse, remember = true) {
  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;
  otherStorage.removeItem(AUTH_TOKEN_KEY);
  otherStorage.removeItem(AUTH_USER_KEY);
  otherStorage.removeItem(AUTH_SESSION_KEY);
  storage.setItem(AUTH_TOKEN_KEY, loginData.accessToken);
  storage.setItem(AUTH_USER_KEY, JSON.stringify(loginData.user || {}));
  storage.setItem(AUTH_SESSION_KEY, JSON.stringify(loginData));
}

export function readAuthSession(): LoginResponse | null {
  const rawSession = localStorage.getItem(AUTH_SESSION_KEY) || sessionStorage.getItem(AUTH_SESSION_KEY);
  if (rawSession) {
    try {
      const session = JSON.parse(rawSession) as LoginResponse;
      if (session?.accessToken) {
        return session;
      }
    } catch {
      clearAuthSession();
      return null;
    }
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return null;

  const rawUser = localStorage.getItem(AUTH_USER_KEY) || sessionStorage.getItem(AUTH_USER_KEY);
  return {
    accessToken: token,
    user: rawUser ? JSON.parse(rawUser) : {}
  };
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

export function requireFreshLogin() {
  clearAuthSession();
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}
