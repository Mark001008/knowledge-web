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
