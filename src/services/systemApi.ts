import type {
  CreateUserRequest,
  CreateRoleRequest,
  CreateMenuRequest,
  CreatePermissionRequest,
  MenuDTO,
  PermissionDTO,
  RoleDetailDTO,
  UpdateUserRequest,
  UpdateRoleRequest,
  UpdateMenuRequest,
  UpdatePermissionRequest,
  UserDTO
} from "../shared/types/system";
import { requireFreshLogin } from "./authSession";
import { appConfig } from "../config/appConfig";

const API_BASE = `${appConfig.apiBaseUrl}/api/system`;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token =
    localStorage.getItem("kb_access_token") ||
    sessionStorage.getItem("kb_access_token") ||
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 401) {
      requireFreshLogin();
      throw new Error("登录状态已过期，请重新登录");
    }
    if (response.status === 403) {
      throw new Error(error.message || "您没有执行此操作的权限");
    }
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}

// ==================== 用户管理 ====================

export async function loadUsers(): Promise<UserDTO[]> {
  return request<UserDTO[]>(`${API_BASE}/users`);
}

export async function getUserById(id: number): Promise<UserDTO> {
  return request<UserDTO>(`${API_BASE}/users/${id}`);
}

export async function createUser(data: CreateUserRequest): Promise<UserDTO> {
  return request<UserDTO>(`${API_BASE}/users`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateUser(id: number, data: UpdateUserRequest): Promise<UserDTO> {
  return request<UserDTO>(`${API_BASE}/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function updateUserStatus(id: number, status: string): Promise<void> {
  return request<void>(`${API_BASE}/users/${id}/status`, {
    method: "PUT",
    body: JSON.stringify(status)
  });
}

export async function resetPassword(id: number, newPassword: string): Promise<void> {
  return request<void>(`${API_BASE}/users/${id}/password`, {
    method: "PUT",
    body: JSON.stringify(newPassword)
  });
}

export async function assignRoles(userId: number, roleIds: number[]): Promise<void> {
  return request<void>(`${API_BASE}/users/${userId}/roles`, {
    method: "PUT",
    body: JSON.stringify(roleIds)
  });
}

// ==================== 角色管理 ====================

export async function loadRoles(): Promise<RoleDetailDTO[]> {
  return request<RoleDetailDTO[]>(`${API_BASE}/roles`);
}

export async function getRoleById(id: number): Promise<RoleDetailDTO> {
  return request<RoleDetailDTO>(`${API_BASE}/roles/${id}`);
}

export async function createRole(data: CreateRoleRequest): Promise<RoleDetailDTO> {
  return request<RoleDetailDTO>(`${API_BASE}/roles`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateRole(id: number, data: UpdateRoleRequest): Promise<RoleDetailDTO> {
  return request<RoleDetailDTO>(`${API_BASE}/roles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteRole(id: number): Promise<void> {
  return request<void>(`${API_BASE}/roles/${id}`, {
    method: "DELETE"
  });
}

export async function assignPermissions(roleId: number, permissionIds: number[]): Promise<void> {
  return request<void>(`${API_BASE}/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify(permissionIds)
  });
}

export async function getRolePermissionIds(roleId: number): Promise<number[]> {
  return request<number[]>(`${API_BASE}/roles/${roleId}/permissions`);
}

export async function assignMenus(roleId: number, menuIds: number[]): Promise<void> {
  return request<void>(`${API_BASE}/roles/${roleId}/menus`, {
    method: "PUT",
    body: JSON.stringify(menuIds)
  });
}

// ==================== 菜单管理 ====================

export async function loadMenus(): Promise<MenuDTO[]> {
  return request<MenuDTO[]>(`${API_BASE}/menus`);
}

export async function getMenuById(id: number): Promise<MenuDTO> {
  return request<MenuDTO>(`${API_BASE}/menus/${id}`);
}

export async function createMenu(data: CreateMenuRequest): Promise<MenuDTO> {
  return request<MenuDTO>(`${API_BASE}/menus`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updateMenu(id: number, data: UpdateMenuRequest): Promise<MenuDTO> {
  return request<MenuDTO>(`${API_BASE}/menus/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deleteMenu(id: number): Promise<void> {
  return request<void>(`${API_BASE}/menus/${id}`, {
    method: "DELETE"
  });
}

// ==================== 权限管理 ====================

export async function loadPermissions(): Promise<PermissionDTO[]> {
  return request<PermissionDTO[]>(`${API_BASE}/permissions`);
}

export async function getPermissionById(id: number): Promise<PermissionDTO> {
  return request<PermissionDTO>(`${API_BASE}/permissions/${id}`);
}

export async function createPermission(data: CreatePermissionRequest): Promise<PermissionDTO> {
  return request<PermissionDTO>(`${API_BASE}/permissions`, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function updatePermission(id: number, data: UpdatePermissionRequest): Promise<PermissionDTO> {
  return request<PermissionDTO>(`${API_BASE}/permissions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export async function deletePermission(id: number): Promise<void> {
  return request<void>(`${API_BASE}/permissions/${id}`, {
    method: "DELETE"
  });
}
