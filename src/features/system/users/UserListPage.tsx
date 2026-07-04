import { useEffect, useState } from "react";
import { loadUsers, createUser, updateUser, updateUserStatus, resetPassword, assignRoles, loadRoles } from "../../../services/systemApi";
import type { UserDTO, CreateUserRequest, RoleDetailDTO } from "../../../shared/types/system";

interface UserListPageProps {
  token: string;
}

export function UserListPage({ token }: UserListPageProps) {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [roles, setRoles] = useState<RoleDetailDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [showAssignRolesDialog, setShowAssignRolesDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDTO | null>(null);
  const [formData, setFormData] = useState<CreateUserRequest>({
    username: "",
    password: "",
    displayName: "",
    email: ""
  });
  const [editFormData, setEditFormData] = useState({
    displayName: "",
    email: ""
  });
  const [newPassword, setNewPassword] = useState("");
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        loadUsers(),
        loadRoles()
      ]);
      setUsers(usersData);
      setRoles(rolesData);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser() {
    try {
      await createUser(formData);
      setShowCreateDialog(false);
      setFormData({ username: "", password: "", displayName: "", email: "" });
      loadData();
    } catch (error) {
      console.error("创建用户失败:", error);
      alert("创建用户失败");
    }
  }

  async function handleUpdateUser() {
    if (!selectedUser) return;
    try {
      await updateUser(selectedUser.id, editFormData);
      setShowEditDialog(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error("更新用户失败:", error);
      alert("更新用户失败");
    }
  }

  async function handleToggleStatus(user: UserDTO) {
    const newStatus = user.status === "ENABLED" ? "DISABLED" : "ENABLED";
    if (user.username === "admin" && newStatus === "DISABLED") {
      alert("不能禁用管理员用户");
      return;
    }
    try {
      await updateUserStatus(user.id, newStatus);
      loadData();
    } catch (error) {
      console.error("更新用户状态失败:", error);
      alert("更新用户状态失败");
    }
  }

  async function handleResetPassword() {
    if (!selectedUser || !newPassword) return;
    try {
      await resetPassword(selectedUser.id, newPassword);
      setShowResetPasswordDialog(false);
      setSelectedUser(null);
      setNewPassword("");
      alert("密码重置成功");
    } catch (error) {
      console.error("重置密码失败:", error);
      alert("重置密码失败");
    }
  }

  async function handleAssignRoles() {
    if (!selectedUser) return;
    try {
      await assignRoles(selectedUser.id, selectedRoleIds);
      setShowAssignRolesDialog(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error("分配角色失败:", error);
      alert("分配角色失败");
    }
  }

  function openEditDialog(user: UserDTO) {
    setSelectedUser(user);
    setEditFormData({
      displayName: user.displayName,
      email: user.email || ""
    });
    setShowEditDialog(true);
  }

  function openResetPasswordDialog(user: UserDTO) {
    setSelectedUser(user);
    setNewPassword("");
    setShowResetPasswordDialog(true);
  }

  function openAssignRolesDialog(user: UserDTO) {
    setSelectedUser(user);
    setSelectedRoleIds(user.roles?.map(r => r.id).filter((id): id is number => id !== null) || []);
    setShowAssignRolesDialog(true);
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>用户管理</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
          新建用户
        </button>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>显示名称</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.displayName}</td>
                <td>{user.email || "-"}</td>
                <td>{user.roles?.map(r => r.roleName).join(", ") || "-"}</td>
                <td>
                  <span className={`status-badge ${user.status === "ENABLED" ? "status-enabled" : "status-disabled"}`}>
                    {user.status === "ENABLED" ? "启用" : "禁用"}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleString()}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn btn-small" onClick={() => openEditDialog(user)}>编辑</button>
                    <button className="btn btn-small" onClick={() => handleToggleStatus(user)}>
                      {user.status === "ENABLED" ? "禁用" : "启用"}
                    </button>
                    <button className="btn btn-small" onClick={() => openResetPasswordDialog(user)}>重置密码</button>
                    <button className="btn btn-small" onClick={() => openAssignRolesDialog(user)}>分配角色</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 创建用户对话框 */}
      {showCreateDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>新建用户</h2>
            <div className="form-group">
              <label>用户名</label>
              <input
                type="text"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>密码</label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>显示名称</label>
              <input
                type="text"
                value={formData.displayName}
                onChange={e => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>邮箱</label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowCreateDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateUser}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户对话框 */}
      {showEditDialog && selectedUser && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>编辑用户</h2>
            <div className="form-group">
              <label>显示名称</label>
              <input
                type="text"
                value={editFormData.displayName}
                onChange={e => setEditFormData({ ...editFormData, displayName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>邮箱</label>
              <input
                type="email"
                value={editFormData.email}
                onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowEditDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleUpdateUser}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 重置密码对话框 */}
      {showResetPasswordDialog && selectedUser && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>重置密码 - {selectedUser.username}</h2>
            <div className="form-group">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowResetPasswordDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleResetPassword}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 分配角色对话框 */}
      {showAssignRolesDialog && selectedUser && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>分配角色 - {selectedUser.username}</h2>
            <div className="form-group">
              <label>角色</label>
              <div className="checkbox-group">
                {roles.map(role => (
                  <label key={role.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.includes(role.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedRoleIds([...selectedRoleIds, role.id]);
                        } else {
                          setSelectedRoleIds(selectedRoleIds.filter(id => id !== role.id));
                        }
                      }}
                    />
                    {role.roleName}
                  </label>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowAssignRolesDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleAssignRoles}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
