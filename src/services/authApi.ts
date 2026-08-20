import { appConfig } from "../config/appConfig";
import type { LoginResponse } from "../shared/types/domain";

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export async function loginWithPassword(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username: username.trim(), password })
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<LoginResponse> | null;

  if (!response.ok) {
    throw new Error(payload?.message || `登录失败，服务返回 ${response.status}`);
  }
  if (!payload || payload.code !== 0 || !payload.data?.accessToken) {
    throw new Error(payload?.message || "登录失败，请检查账号信息");
  }

  return payload.data;
}

/**
 * 用户登出
 * 调用后端接口将 Token 加入黑名单
 */
export async function logoutFromServer(token: string): Promise<void> {
  try {
    await fetch(`${appConfig.apiBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
  } catch {
    // 登出接口失败不影响客户端清除 Token
    console.warn("登出接口调用失败，客户端仍将清除本地 Token");
  }
}
