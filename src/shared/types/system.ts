/**
 * 系统管理相关类型定义
 */

export interface RoleDTO {
  id: number | null;
  roleCode: string;
  roleName: string;
}

export interface RoleDetailDTO {
  id: number;
  roleCode: string;
  roleName: string;
  description: string | null;
  builtin: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuDTO {
  id: number;
  parentId: number;
  menuName: string;
  menuType: string;
  path: string | null;
  component: string | null;
  icon: string | null;
  permissionCode: string | null;
  sort: number;
  visible: number;
  children?: MenuDTO[];
}

export interface PermissionDTO {
  id: number;
  permissionCode: string;
  permissionName: string;
  module: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDTO {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  roles: RoleDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  email?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  status?: string;
}

export interface CreateRoleRequest {
  roleCode: string;
  roleName: string;
  description?: string;
}

export interface UpdateRoleRequest {
  roleName?: string;
  description?: string;
  status?: string;
}

export interface CreateMenuRequest {
  parentId: number;
  menuName: string;
  menuType: string;
  path?: string;
  component?: string;
  icon?: string;
  permissionCode?: string;
  sort?: number;
  visible?: number;
}

export interface UpdateMenuRequest {
  parentId?: number;
  menuName?: string;
  menuType?: string;
  path?: string;
  component?: string;
  icon?: string;
  permissionCode?: string;
  sort?: number;
  visible?: number;
  status?: string;
}

export interface CreatePermissionRequest {
  permissionCode: string;
  permissionName: string;
  module: string;
  description?: string;
}

export interface UpdatePermissionRequest {
  permissionName?: string;
  module?: string;
  description?: string;
  status?: string;
}
