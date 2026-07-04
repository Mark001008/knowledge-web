import { useEffect, useState } from "react";
import { loadPermissions, createPermission, updatePermission, deletePermission } from "../../../services/systemApi";
import type { PermissionDTO, CreatePermissionRequest } from "../../../shared/types/system";

interface PermissionListPageProps {
  token: string;
}

export function PermissionListPage({ token }: PermissionListPageProps) {
  const [permissions, setPermissions] = useState<PermissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<PermissionDTO | null>(null);
  const [formData, setFormData] = useState<CreatePermissionRequest>({
    permissionCode: "",
    permissionName: "",
    module: "",
    description: ""
  });
  const [editFormData, setEditFormData] = useState({
    permissionName: "",
    module: "",
    description: "",
    status: "ENABLED"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const permissionsData = await loadPermissions();
      setPermissions(permissionsData);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePermission() {
    try {
      await createPermission(formData);
      setShowCreateDialog(false);
      setFormData({ permissionCode: "", permissionName: "", module: "", description: "" });
      loadData();
    } catch (error) {
      console.error("创建权限失败:", error);
      alert("创建权限失败");
    }
  }

  async function handleUpdatePermission() {
    if (!selectedPermission) return;
    try {
      await updatePermission(selectedPermission.id, editFormData);
      setShowEditDialog(false);
      setSelectedPermission(null);
      loadData();
    } catch (error) {
      console.error("更新权限失败:", error);
      alert("更新权限失败");
    }
  }

  async function handleDeletePermission(permission: PermissionDTO) {
    if (!confirm(`确定要删除权限 "${permission.permissionName}" 吗？`)) {
      return;
    }
    try {
      await deletePermission(permission.id);
      loadData();
    } catch (error) {
      console.error("删除权限失败:", error);
      alert("删除权限失败");
    }
  }

  function openEditDialog(permission: PermissionDTO) {
    setSelectedPermission(permission);
    setEditFormData({
      permissionName: permission.permissionName,
      module: permission.module,
      description: permission.description || "",
      status: permission.status
    });
    setShowEditDialog(true);
  }

  // 按模块分组权限
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) {
      acc[p.module] = [];
    }
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, PermissionDTO[]>);

  // 获取所有模块
  const modules = Object.keys(permissionsByModule).sort();

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>权限管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
          新建权限
        </button>
      </div>

      {/* 权限统计 */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">总权限数：</span>
          <span className="stat-value">{permissions.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">模块数：</span>
          <span className="stat-value">{modules.length}</span>
        </div>
      </div>

      {/* 按模块分组展示 */}
      {modules.map(module => (
        <div key={module} className="module-section">
          <h2 className="module-title">{module}</h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>权限编码</th>
                  <th>权限名称</th>
                  <th>描述</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {permissionsByModule[module].map(permission => (
                  <tr key={permission.id}>
                    <td><code>{permission.permissionCode}</code></td>
                    <td>{permission.permissionName}</td>
                    <td>{permission.description || "-"}</td>
                    <td>
                      <span className={`status-badge ${permission.status === "ENABLED" ? "status-enabled" : "status-disabled"}`}>
                        {permission.status === "ENABLED" ? "启用" : "禁用"}
                      </span>
                    </td>
                    <td>{new Date(permission.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn btn-small" onClick={() => openEditDialog(permission)}>编辑</button>
                        <button className="btn btn-small btn-danger" onClick={() => handleDeletePermission(permission)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 创建权限对话框 */}
      {showCreateDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>新建权限</h2>
            <div className="form-group">
              <label>权限编码</label>
              <input
                type="text"
                value={formData.permissionCode}
                onChange={e => setFormData({ ...formData, permissionCode: e.target.value })}
                placeholder="例如：space:create"
              />
            </div>
            <div className="form-group">
              <label>权限名称</label>
              <input
                type="text"
                value={formData.permissionName}
                onChange={e => setFormData({ ...formData, permissionName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>所属模块</label>
              <input
                type="text"
                value={formData.module}
                onChange={e => setFormData({ ...formData, module: e.target.value })}
                placeholder="例如：知识库"
                list="modules-list"
              />
              <datalist id="modules-list">
                {modules.map(m => (
                  <option key={m} value={m} />
                ))}
              </datalist>
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
              <button className="btn btn-primary" onClick={handleCreatePermission}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑权限对话框 */}
      {showEditDialog && selectedPermission && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>编辑权限</h2>
            <div className="form-group">
              <label>权限编码</label>
              <input
                type="text"
                value={selectedPermission.permissionCode}
                disabled
              />
            </div>
            <div className="form-group">
              <label>权限名称</label>
              <input
                type="text"
                value={editFormData.permissionName}
                onChange={e => setEditFormData({ ...editFormData, permissionName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>所属模块</label>
              <input
                type="text"
                value={editFormData.module}
                onChange={e => setEditFormData({ ...editFormData, module: e.target.value })}
                list="modules-list"
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <textarea
                value={editFormData.description}
                onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>状态</label>
              <select
                value={editFormData.status}
                onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}
              >
                <option value="ENABLED">启用</option>
                <option value="DISABLED">禁用</option>
              </select>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowEditDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleUpdatePermission}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
