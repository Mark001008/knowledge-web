import { useEffect, useState } from "react";
import { loadUsers, createUser, updateUser, updateUserStatus, resetPassword, assignRoles, loadRoles } from "../../../services/systemApi";
import type { UserDTO, CreateUserRequest, RoleDetailDTO } from "../../../shared/types/system";

// shadcn-ui components
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { ScrollArea } from "../../../components/ui/scroll-area";
import {
  IconPlus,
  IconDots,
  IconEdit,
  IconRefresh,
  IconUserCog,
  IconLoader2
} from "@tabler/icons-react";
import { SystemNotice, type SystemNoticeState, toErrorMessage } from "../components/SystemFeedback";

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
  const [notice, setNotice] = useState<SystemNoticeState>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [usersResult, rolesResult] = await Promise.allSettled([
        loadUsers(),
        loadRoles()
      ]);
      if (usersResult.status === "fulfilled") setUsers(usersResult.value);
      if (rolesResult.status === "fulfilled") setRoles(rolesResult.value);
      const failed = [usersResult, rolesResult].filter(r => r.status === "rejected");
      if (failed.length > 0) {
        setNotice({ tone: "error", title: "部分数据加载失败", message: "某些功能可能不可用，请检查权限或稍后重试" });
      }
    } catch (error) {
      setNotice({ tone: "error", title: "加载数据失败", message: toErrorMessage(error, "请稍后重试") });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser() {
    try {
      await createUser(formData);
      setShowCreateDialog(false);
      setFormData({ username: "", password: "", displayName: "", email: "" });
      setNotice({ tone: "success", title: "用户已创建" });
      loadData();
    } catch (error) {
      setNotice({ tone: "error", title: "创建用户失败", message: toErrorMessage(error, "请检查用户名是否重复") });
    }
  }

  async function handleUpdateUser() {
    if (!selectedUser) return;
    try {
      await updateUser(selectedUser.id, editFormData);
      setShowEditDialog(false);
      setSelectedUser(null);
      setNotice({ tone: "success", title: "用户已更新" });
      loadData();
    } catch (error) {
      setNotice({ tone: "error", title: "更新用户失败", message: toErrorMessage(error, "请稍后重试") });
    }
  }

  async function handleToggleStatus(user: UserDTO) {
    const newStatus = user.status === "ENABLED" ? "DISABLED" : "ENABLED";
    if (user.username === "admin" && newStatus === "DISABLED") {
      setNotice({ tone: "error", title: "不能禁用管理员用户" });
      return;
    }
    try {
      await updateUserStatus(user.id, newStatus);
      setNotice({ tone: "success", title: newStatus === "ENABLED" ? "用户已启用" : "用户已禁用" });
      loadData();
    } catch (error) {
      setNotice({ tone: "error", title: "更新用户状态失败", message: toErrorMessage(error, "请稍后重试") });
    }
  }

  async function handleResetPassword() {
    if (!selectedUser || !newPassword) return;
    try {
      await resetPassword(selectedUser.id, newPassword);
      setShowResetPasswordDialog(false);
      setSelectedUser(null);
      setNewPassword("");
      setNotice({ tone: "success", title: "密码已重置" });
    } catch (error) {
      setNotice({ tone: "error", title: "重置密码失败", message: toErrorMessage(error, "请检查新密码") });
    }
  }

  async function handleAssignRoles() {
    if (!selectedUser) return;
    try {
      await assignRoles(selectedUser.id, selectedRoleIds);
      setShowAssignRolesDialog(false);
      setSelectedUser(null);
      setNotice({ tone: "success", title: "角色已分配" });
      loadData();
    } catch (error) {
      setNotice({ tone: "error", title: "分配角色失败", message: toErrorMessage(error, "请稍后重试") });
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
    return (
      <div className="flex items-center justify-center h-64">
        <IconLoader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SystemNotice notice={notice} onClose={() => setNotice(null)} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">用户管理</h2>
          <p className="text-muted-foreground">
            管理系统中的所有用户
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <IconPlus className="mr-2 h-4 w-4" />
          新建用户
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>显示名称</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.displayName}</TableCell>
                <TableCell>{user.email || "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.roles?.map((role) => (
                      <Badge key={role.roleCode} variant="secondary">
                        {role.roleName}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === "ENABLED" ? "default" : "destructive"}>
                    {user.status === "ENABLED" ? "启用" : "禁用"}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">打开菜单</span>
                        <IconDots className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>操作</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => openEditDialog(user)}>
                        <IconEdit className="mr-2 h-4 w-4" />
                        编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(user)}>
                        <IconRefresh className="mr-2 h-4 w-4" />
                        {user.status === "ENABLED" ? "禁用" : "启用"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openResetPasswordDialog(user)}>
                        <IconRefresh className="mr-2 h-4 w-4" />
                        重置密码
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openAssignRolesDialog(user)}>
                        <IconUserCog className="mr-2 h-4 w-4" />
                        分配角色
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* 创建用户对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>
              创建一个新的系统用户
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="请输入密码"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="displayName">显示名称</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="请输入显示名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="请输入邮箱"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateUser}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>
              修改用户信息
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-displayName">显示名称</Label>
              <Input
                id="edit-displayName"
                value={editFormData.displayName}
                onChange={(e) => setEditFormData({ ...editFormData, displayName: e.target.value })}
                placeholder="请输入显示名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">邮箱</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                placeholder="请输入邮箱"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateUser}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.username} 重置密码
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPasswordDialog(false)}>
              取消
            </Button>
            <Button onClick={handleResetPassword}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分配角色对话框 */}
      <Dialog open={showAssignRolesDialog} onOpenChange={setShowAssignRolesDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>分配角色</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.username} 分配角色
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[300px]">
            <div className="space-y-4 p-4">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`role-${role.id}`}
                    checked={selectedRoleIds.includes(role.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedRoleIds([...selectedRoleIds, role.id]);
                      } else {
                        setSelectedRoleIds(selectedRoleIds.filter(id => id !== role.id));
                      }
                    }}
                  />
                  <Label htmlFor={`role-${role.id}`}>{role.roleName}</Label>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignRolesDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAssignRoles}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
