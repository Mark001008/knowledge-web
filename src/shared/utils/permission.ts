import type { MenuDTO } from "../types/system";

/**
 * 检查用户是否拥有指定权限
 */
export function hasPermission(permissions: string[], permissionCode: string): boolean {
  return permissions.includes(permissionCode);
}

/**
 * 检查用户是否拥有任意一个权限
 */
export function hasAnyPermission(permissions: string[], permissionCodes: string[]): boolean {
  return permissionCodes.some(code => permissions.includes(code));
}

/**
 * 检查用户是否拥有所有权限
 */
export function hasAllPermissions(permissions: string[], permissionCodes: string[]): boolean {
  return permissionCodes.every(code => permissions.includes(code));
}

/**
 * 检查用户是否可以访问指定路径的菜单
 */
export function canAccessMenu(menus: MenuDTO[], path: string): boolean {
  return findMenuByPath(menus, path) !== null;
}

/**
 * 根据路径查找菜单
 */
function findMenuByPath(menus: MenuDTO[], path: string): MenuDTO | null {
  for (const menu of menus) {
    if (menu.path === path) {
      return menu;
    }
    if (menu.children && menu.children.length > 0) {
      const found = findMenuByPath(menu.children, path);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * 获取所有权限码（扁平化）
 */
export function getAllPermissionCodes(menus: MenuDTO[]): string[] {
  const codes: string[] = [];
  for (const menu of menus) {
    if (menu.permissionCode) {
      codes.push(menu.permissionCode);
    }
    if (menu.children && menu.children.length > 0) {
      codes.push(...getAllPermissionCodes(menu.children));
    }
  }
  return codes;
}
