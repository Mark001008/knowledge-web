import type { LoginResponse } from "../shared/types/domain";
import { logoutFromServer } from "./authApi";

const AUTH_TOKEN_KEY = "kb_access_token";
const AUTH_USER_KEY = "kb_user";
const AUTH_SESSION_KEY = "kb_session";
const REMEMBER_USER_KEY = "kb_remember_user";
export const AUTH_REQUIRED_EVENT = "kb:auth-required";

/**
 * 保存认证会话
 * Token 始终存储在 sessionStorage（关闭浏览器自动清除，防止 XSS 持久化攻击）
 * remember 仅控制是否记住用户名
 */
export function saveAuthSession(loginData: LoginResponse, remember = true) {
  // Token 和会话始终使用 sessionStorage
  sessionStorage.setItem(AUTH_TOKEN_KEY, loginData.accessToken);
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(loginData.user || {}));
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(loginData));

  // 清除 localStorage 中可能残留的旧 token
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);

  // remember 仅控制是否记住用户名（非敏感信息）
  if (remember && loginData.user?.username) {
    localStorage.setItem(REMEMBER_USER_KEY, loginData.user.username);
  } else {
    localStorage.removeItem(REMEMBER_USER_KEY);
  }
}

/**
 * 读取记住的用户名
 */
export function getRememberedUsername(): string | null {
  return localStorage.getItem(REMEMBER_USER_KEY);
}

/**
 * 读取认证会话（仅从 sessionStorage 读取）
 */
export function readAuthSession(): LoginResponse | null {
  const rawSession = sessionStorage.getItem(AUTH_SESSION_KEY);
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

  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) return null;

  const rawUser = sessionStorage.getItem(AUTH_USER_KEY);
  return {
    accessToken: token,
    user: rawUser ? JSON.parse(rawUser) : {}
  };
}

/**
 * 清除认证会话
 */
export function clearAuthSession() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  // 清除 localStorage 中可能残留的旧 token
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
}

/**
 * 用户登出
 * 先调用后端接口将 Token 加入黑名单，再清除本地会话
 */
export async function logout(): Promise<void> {
  const session = readAuthSession();
  if (session?.accessToken) {
    await logoutFromServer(session.accessToken);
  }
  clearAuthSession();
}

/**
 * 要求重新登录
 */
export function requireFreshLogin() {
  clearAuthSession();
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}
