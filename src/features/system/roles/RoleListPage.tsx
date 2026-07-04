import { useEffect, useState } from "react";
import { loadRoles, createRole, updateRole, deleteRole, assignPermissions, assignMenus, loadPermissions, loadMenus } from "../../../services/systemApi";
import type { RoleDetailDTO, CreateRoleRequest, PermissionDTO, MenuDTO } from "../../../shared/types/system";

interface RoleListPageProps {
  token: string;
}

export function RoleListPage({ token }: RoleListPageProps) {
  const [roles, setRoles] = useState<RoleDetailDTO[]>([]);
  const [permissions, setPermissions] = useState<PermissionDTO[]>([]);
  const [menus, setMenus] = useState<MenuDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAssignPermissionsDialog, setShowAssignPermissionsDialog] = useState(false);
  const [showAssignMenusDialog, setShowAssignMenusDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleDetailDTO | null>(null);
  const [formData, setFormData] = useState<CreateRoleRequest>({
    roleCode: "",
    roleName: "",
    description: ""
  });
  const [editFormData, setEditFormData] = useState({
    roleName: "",
    description: ""
  });
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [rolesData, permissionsData, menusData] = await Promise.all([
        loadRoles(),
        loadPermissions(),
        loadMenus()
      ]);
      setRoles(rolesData);
      setPermissions(permissionsData);
      setMenus(menusData);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRole() {
    try {
      await createRole(formData);
      setShowCreateDialog(false);
      setFormData({ roleCode: "", roleName: "", description: "" });
      loadData();
    } catch (error) {
      console.error("创建角色失败:", error);
      alert("创建角色失败");
    }
  }

  async function handleUpdateRole() {
    if (!selectedRole) return;
    try {
      await updateRole(selectedRole.id, editFormData);
      setShowEditDialog(false);
      setSelectedRole(null);
      loadData();
    } catch (error) {
      console.error("更新角色失败:", error);
      alert("更新角色失败");
    }
  }

  async function handleDeleteRole(role: RoleDetailDTO) {
    if (role.builtin === 1) {
      alert("内置角色不能删除");
      return;
    }
    if (!confirm(`确定要删除角色 "${role.roleName}" 吗？`)) {
      return;
    }
    try {
      await deleteRole(role.id);
      loadData();
    } catch (error) {
      console.error("删除角色失败:", error);
      alert("删除角色失败");
    }
  }

  async function handleAssignPermissions() {
    if (!selectedRole) return;
    try {
      await assignPermissions(selectedRole.id, selectedPermissionIds);
      setShowAssignPermissionsDialog(false);
      setSelectedRole(null);
      loadData();
    } catch (error) {
      console.error("分配权限失败:", error);
      alert("分配权限失败");
    }
  }

  async function handleAssignMenus() {
    if (!selectedRole) return;
    try {
      await assignMenus(selectedRole.id, selectedMenuIds);
      setShowAssignMenusDialog(false);
      setSelectedRole(null);
      loadData();
    } catch (error) {
      console.error("分配菜单失败:", error);
      alert("分配菜单失败");
    }
  }

  function openEditDialog(role: RoleDetailDTO) {
    setSelectedRole(role);
    setEditFormData({
      roleName: role.roleName,
      description: role.description || ""
    });
    setShowEditDialog(true);
  }

  function openAssignPermissionsDialog(role: RoleDetailDTO) {
    setSelectedRole(role);
    // TODO: 需要从后端获取角色已有的权限ID列表
    setSelectedPermissionIds([]);
    setShowAssignPermissionsDialog(true);
  }

  function openAssignMenusDialog(role: RoleDetailDTO) {
    setSelectedRole(role);
    // TODO: 需要从后端获取角色已有的菜单ID列表
    setSelectedMenuIds([]);
    setShowAssignMenusDialog(true);
  }

  // 按模块分组权限
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) {
      acc[p.module] = [];
    }
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, PermissionDTO[]>);

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>角色管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
          新建角色
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>角色编码</th>
              <th>角色名称</th>
              <th>描述</th>
              <th>内置</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.id}>
                <td>{role.roleCode}</td>
                <td>{role.roleName}</td>
                <td>{role.description || "-"}</td>
                <td>{role.builtin === 1 ? "是" : "否"}</td>
                <td>
                  <span className={`status-badge ${role.status === "ENABLED" ? "status-enabled" : "status-disabled"}`}>
                    {role.status === "ENABLED" ? "启用" : "禁用"}
                  </span>
                </td>
                <td>{new Date(role.createdAt).toLocaleString()}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-small" onClick={() => openEditDialog(role)}>编辑</button>
                    <button className="btn btn-small" onClick={() => openAssignPermissionsDialog(role)}>分配权限</button>
                    <button className="btn btn-small" onClick={() => openAssignMenusDialog(role)}>分配菜单</button>
                    {role.builtin !== 1 && (
                      <button className="btn btn-small btn-danger" onClick={() => handleDeleteRole(role)}>删除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 创建角色对话框 */}
      {showCreateDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>新建角色</h2>
            <div className="form-group">
              <label>角色编码</label>
              <input
                type="text"
                value={formData.roleCode}
                onChange={e => setFormData({ ...formData, roleCode: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>角色名称</label>
              <input
                type="text"
                value={formData.roleName}
                onChange={e => setFormData({ ...formData, roleName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowCreateDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateRole}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑角色对话框 */}
      {showEditDialog && selectedRole && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>编辑角色</h2>
            <div className="form-group">
              <label>角色名称</label>
              <input
                type="text"
                value={editFormData.roleName}
                onChange={e => setEditFormData({ ...editFormData, roleName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <textarea
                value={editFormData.description}
                onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowEditDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleUpdateRole}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 分配权限对话框 */}
      {showAssignPermissionsDialog && selectedRole && (
        <div className="dialog-overlay">
          <div className="dialog dialog-large">
            <h2>分配权限 - {selectedRole.roleName}</h2>
            <div className="form-group">
              <label>权限</label>
              <div className="permission-groups">
                {Object.entries(permissionsByModule).map(([module, perms]) => (
                  <div key={module} className="permission-group">
                    <h3>{module}</h3>
                    <div className="checkbox-group">
                      {perms.map(perm => (
                        <label key={perm.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedPermissionIds.includes(perm.id)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedPermissionIds([...selectedPermissionIds, perm.id]);
                              } else {
                                setSelectedPermissionIds(selectedPermissionIds.filter(id => id !== perm.id));
                              }
                            }}
                          />
                          {perm.permissionName}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowAssignPermissionsDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAssignPermissions}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 分配菜单对话框 */}
      {showAssignMenusDialog && selectedRole && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>分配菜单 - {selectedRole.roleName}</h2>
            <div className="form-group">
              <label>菜单</label>
              <div className="checkbox-group">
                {menus.map(menu => (
                  <label key={menu.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMenuIds.includes(menu.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedMenuIds([...selectedMenuIds, menu.id]);
                        } else {
                          setSelectedMenuIds(selectedMenuIds.filter(id => id !== menu.id));
                        }
                      }}
                    />
                    {menu.menuName}
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowAssignMenusDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAssignMenus}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
