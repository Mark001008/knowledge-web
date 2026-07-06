import { useEffect, useState } from "react";
import { loadPermissions, createPermission, updatePermission, deletePermission } from "../../../services/systemApi";
import type { PermissionDTO, CreatePermissionRequest } from "../../../shared/types/system";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
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
  IconPlus,
  IconEdit,
  IconTrash,
  IconChevronRight,
  IconArrowLeft,
  IconLoader2,
  IconLock,
} from "@tabler/icons-react";

interface PermissionListPageProps {
  token: string;
}

// 模块中文名称映射
const MODULE_LABELS: Record<string, string> = {
  space: "知识库",
  document: "文档",
  chat: "会话",
  user: "用户",
  role: "角色",
  menu: "菜单",
  permission: "权限",
  system: "系统",
};

function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] || module;
}

export function PermissionListPage({ token }: PermissionListPageProps) {
  const [permissions, setPermissions] = useState<PermissionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState<string | null>(null);
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

  function openCreateDialog(module?: string) {
    setFormData({
      permissionCode: "",
      permissionName: "",
      module: module || activeModule || "",
      description: ""
    });
    setShowCreateDialog(true);
  }

  // 按模块分组权限
  const permissionsByModule = permissions.reduce((acc, p) => {
    if (!acc[p.module]) {
      acc[p.module] = [];
    }
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, PermissionDTO[]>);

  // 获取所有模块（按权限数量排序）
  const modules = Object.keys(permissionsByModule).sort((a, b) =>
    permissionsByModule[b].length - permissionsByModule[a].length
  );

  // 当前模块的权限
  const modulePermissions = activeModule ? permissionsByModule[activeModule] || [] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <IconLoader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // 模块列表视图
  if (!activeModule) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">权限管理</h2>
            <p className="text-muted-foreground">
              选择模块查看和管理对应权限
            </p>
          </div>
          <Button onClick={() => openCreateDialog()}>
            <IconPlus className="mr-2 h-4 w-4" />
            新建权限
          </Button>
        </div>

        {/* 统计 */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <IconLock className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-gray-600">总权限</span>
            <span className="font-semibold text-gray-900">{permissions.length}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <span className="text-sm text-gray-600">模块</span>
            <span className="font-semibold text-gray-900">{modules.length}</span>
          </div>
        </div>

        {/* 模块卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map(module => {
            const modulePerms = permissionsByModule[module];
            const enabledCount = modulePerms.filter(p => p.status === "ENABLED").length;
            return (
              <button
                key={module}
                className="group relative flex items-start gap-4 p-5 bg-card border rounded-xl hover:shadow-md hover:border-primary/50 transition-all text-left"
                onClick={() => setActiveModule(module)}
              >
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <IconLock className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base text-gray-900">{getModuleLabel(module)}</h3>
                    <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {module}
                    </code>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {modulePerms.length} 个权限 · {enabledCount} 个启用
                  </p>
                </div>
                <IconChevronRight className="h-5 w-5 text-gray-400 group-hover:text-emerald-600 transition-colors flex-shrink-0 mt-1" />
              </button>
            );
          })}
        </div>

        {/* 创建权限对话框 */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>新建权限</DialogTitle>
              <DialogDescription>创建一个新的系统权限</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="permissionCode">权限编码</Label>
                <Input
                  id="permissionCode"
                  value={formData.permissionCode}
                  onChange={e => setFormData({ ...formData, permissionCode: e.target.value })}
                  placeholder="例如：space:create"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="permissionName">权限名称</Label>
                <Input
                  id="permissionName"
                  value={formData.permissionName}
                  onChange={e => setFormData({ ...formData, permissionName: e.target.value })}
                  placeholder="例如：创建知识库"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="module">所属模块</Label>
                <Input
                  id="module"
                  value={formData.module}
                  onChange={e => setFormData({ ...formData, module: e.target.value })}
                  placeholder="例如：space"
                  list="modules-list"
                />
                <datalist id="modules-list">
                  {modules.map(m => (
                    <option key={m} value={m}>{getModuleLabel(m)}</option>
                  ))}
                </datalist>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">描述</Label>
                <Input
                  id="description"
                  value={formData.description || ""}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="权限描述（可选）"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
              <Button onClick={handleCreatePermission}>确定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 模块详情视图
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActiveModule(null)}
            className="gap-1"
          >
            <IconArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">{getModuleLabel(activeModule)}</h2>
              <code className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {activeModule}
              </code>
            </div>
            <p className="text-gray-500">
              共 {modulePermissions.length} 个权限
            </p>
          </div>
        </div>
        <Button onClick={() => openCreateDialog(activeModule)}>
          <IconPlus className="mr-2 h-4 w-4" />
          新建权限
        </Button>
      </div>

      {/* 权限表格 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>权限编码</TableHead>
              <TableHead>权限名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulePermissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                  该模块暂无权限
                </TableCell>
              </TableRow>
            ) : (
              modulePermissions.map(permission => (
                <TableRow key={permission.id}>
                  <TableCell>
                    <code className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">
                      {permission.permissionCode}
                    </code>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900">{permission.permissionName}</TableCell>
                  <TableCell className="text-gray-500">
                    {permission.description || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={permission.status === "ENABLED" ? "default" : "destructive"}>
                      {permission.status === "ENABLED" ? "启用" : "禁用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500">
                    {new Date(permission.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(permission)}
                      >
                        <IconEdit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePermission(permission)}
                        className="text-destructive hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 创建权限对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>新建权限</DialogTitle>
            <DialogDescription>
              为 {getModuleLabel(activeModule)} 模块创建新权限
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="permissionCode">权限编码</Label>
              <Input
                id="permissionCode"
                value={formData.permissionCode}
                onChange={e => setFormData({ ...formData, permissionCode: e.target.value })}
                placeholder={`${activeModule}:action`}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="permissionName">权限名称</Label>
              <Input
                id="permissionName"
                value={formData.permissionName}
                onChange={e => setFormData({ ...formData, permissionName: e.target.value })}
                placeholder="例如：创建知识库"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">描述</Label>
              <Input
                id="description"
                value={formData.description || ""}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="权限描述（可选）"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreatePermission}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑权限对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>编辑权限</DialogTitle>
            <DialogDescription>修改权限信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>权限编码</Label>
              <Input
                value={selectedPermission?.permissionCode || ""}
                disabled
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-permissionName">权限名称</Label>
              <Input
                id="edit-permissionName"
                value={editFormData.permissionName}
                onChange={e => setEditFormData({ ...editFormData, permissionName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-module">所属模块</Label>
              <Input
                id="edit-module"
                value={editFormData.module}
                onChange={e => setEditFormData({ ...editFormData, module: e.target.value })}
                list="modules-list"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">描述</Label>
              <Input
                id="edit-description"
                value={editFormData.description}
                onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-status">状态</Label>
              <select
                id="edit-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editFormData.status}
                onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}
              >
                <option value="ENABLED">启用</option>
                <option value="DISABLED">禁用</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleUpdatePermission}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
