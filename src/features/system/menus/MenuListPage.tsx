import { useEffect, useState } from "react";
import { loadMenus, createMenu, updateMenu, deleteMenu } from "../../../services/systemApi";
import type { MenuDTO, CreateMenuRequest } from "../../../shared/types/system";

interface MenuListPageProps {
  token: string;
}

export function MenuListPage({ token }: MenuListPageProps) {
  const [menus, setMenus] = useState<MenuDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState<MenuDTO | null>(null);
  const [parentMenuId, setParentMenuId] = useState<number>(0);
  const [formData, setFormData] = useState<CreateMenuRequest>({
    parentId: 0,
    menuName: "",
    menuType: "MENU",
    path: "",
    component: "",
    icon: "",
    permissionCode: "",
    sort: 0,
    visible: 1
  });
  const [editFormData, setEditFormData] = useState({
    menuName: "",
    menuType: "MENU",
    path: "",
    component: "",
    icon: "",
    permissionCode: "",
    sort: 0,
    visible: 1,
    status: "ENABLED"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const menusData = await loadMenus();
      setMenus(menusData);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateMenu() {
    try {
      await createMenu({ ...formData, parentId: parentMenuId });
      setShowCreateDialog(false);
      setFormData({
        parentId: 0,
        menuName: "",
        menuType: "MENU",
        path: "",
        component: "",
        icon: "",
        permissionCode: "",
        sort: 0,
        visible: 1
      });
      loadData();
    } catch (error) {
      console.error("创建菜单失败:", error);
      alert("创建菜单失败");
    }
  }

  async function handleUpdateMenu() {
    if (!selectedMenu) return;
    try {
      await updateMenu(selectedMenu.id, editFormData);
      setShowEditDialog(false);
      setSelectedMenu(null);
      loadData();
    } catch (error) {
      console.error("更新菜单失败:", error);
      alert("更新菜单失败");
    }
  }

  async function handleDeleteMenu(menu: MenuDTO) {
    if (!confirm(`确定要删除菜单 "${menu.menuName}" 吗？`)) {
      return;
    }
    try {
      await deleteMenu(menu.id);
      loadData();
    } catch (error) {
      console.error("删除菜单失败:", error);
      alert("删除菜单失败");
    }
  }

  function openCreateDialog(parentId: number = 0) {
    setParentMenuId(parentId);
    setFormData({
      parentId,
      menuName: "",
      menuType: parentId === 0 ? "CATALOG" : "MENU",
      path: "",
      component: "",
      icon: "",
      permissionCode: "",
      sort: 0,
      visible: 1
    });
    setShowCreateDialog(true);
  }

  function openEditDialog(menu: MenuDTO) {
    setSelectedMenu(menu);
    setEditFormData({
      menuName: menu.menuName,
      menuType: menu.menuType,
      path: menu.path || "",
      component: menu.component || "",
      icon: menu.icon || "",
      permissionCode: menu.permissionCode || "",
      sort: menu.sort,
      visible: menu.visible,
      status: "ENABLED"
    });
    setShowEditDialog(true);
  }

  function renderMenuTree(menus: MenuDTO[], level: number = 0) {
    return menus.map(menu => (
      <tr key={menu.id}>
        <td style={{ paddingLeft: `${level * 20 + 16}px` }}>
          {menu.children && menu.children.length > 0 && (
            <span className="tree-icon">▼</span>
          )}
          {menu.icon && <span className={`menu-icon icon-${menu.icon}`}> </span>}
          {menu.menuName}
        </td>
        <td>{menu.menuType}</td>
        <td>{menu.path || "-"}</td>
        <td>{menu.component || "-"}</td>
        <td>{menu.permissionCode || "-"}</td>
        <td>{menu.sort}</td>
        <td>
          <span className={`status-badge ${menu.visible === 1 ? "status-enabled" : "status-disabled"}`}>
            {menu.visible === 1 ? "显示" : "隐藏"}
          </span>
        </td>
        <td>
          <div className="action-buttons">
            {menu.menuType !== "BUTTON" && (
              <button className="btn btn-small" onClick={() => openCreateDialog(menu.id)}>
                添加子菜单
              </button>
            )}
            <button className="btn btn-small" onClick={() => openEditDialog(menu)}>编辑</button>
            <button className="btn btn-small btn-danger" onClick={() => handleDeleteMenu(menu)}>删除</button>
          </div>
        </td>
      </tr>
    ));
  }

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>菜单管理</h1>
        <button className="btn btn-primary" onClick={() => openCreateDialog(0)}>
          新增一级菜单
        </button>
      </div>

      <div className="table-container">
        <table className="data-table tree-table">
          <thead>
            <tr>
              <th>菜单名称</th>
              <th>类型</th>
              <th>路径</th>
              <th>组件</th>
              <th>权限编码</th>
              <th>排序</th>
              <th>可见</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {renderMenuTree(menus)}
          </tbody>
        </table>
      </div>

      {/* 创建菜单对话框 */}
      {showCreateDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>{parentMenuId === 0 ? "新增一级菜单" : "新增子菜单"}</h2>
            <div className="form-group">
              <label>菜单名称</label>
              <input
                type="text"
                value={formData.menuName}
                onChange={e => setFormData({ ...formData, menuName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>菜单类型</label>
              <select
                value={formData.menuType}
                onChange={e => setFormData({ ...formData, menuType: e.target.value })}
              >
                <option value="CATALOG">目录</option>
                <option value="MENU">菜单</option>
                <option value="BUTTON">按钮</option>
              </select>
            </div>
            {formData.menuType !== "BUTTON" && (
              <>
                <div className="form-group">
                  <label>路由路径</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={e => setFormData({ ...formData, path: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>组件路径</label>
                  <input
                    type="text"
                    value={formData.component}
                    onChange={e => setFormData({ ...formData, component: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="form-group">
              <label>图标</label>
              <input
                type="text"
                value={formData.icon}
                onChange={e => setFormData({ ...formData, icon: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>权限编码</label>
              <input
                type="text"
                value={formData.permissionCode}
                onChange={e => setFormData({ ...formData, permissionCode: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>排序</label>
              <input
                type="number"
                value={formData.sort}
                onChange={e => setFormData({ ...formData, sort: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>可见</label>
              <select
                value={formData.visible}
                onChange={e => setFormData({ ...formData, visible: parseInt(e.target.value) })}
              >
                <option value={1}>显示</option>
                <option value={0}>隐藏</option>
              </select>
            </div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setShowCreateDialog(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleCreateMenu}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑菜单对话框 */}
      {showEditDialog && selectedMenu && (
        <div className="dialog-overlay">
          <div className="dialog">
            <h2>编辑菜单</h2>
            <div className="form-group">
              <label>菜单名称</label>
              <input
                type="text"
                value={editFormData.menuName}
                onChange={e => setEditFormData({ ...editFormData, menuName: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>菜单类型</label>
              <select
                value={editFormData.menuType}
                onChange={e => setEditFormData({ ...editFormData, menuType: e.target.value })}
              >
                <option value="CATALOG">目录</option>
                <option value="MENU">菜单</option>
                <option value="BUTTON">按钮</option>
              </select>
            </div>
            {editFormData.menuType !== "BUTTON" && (
              <>
                <div className="form-group">
                  <label>路由路径</label>
                  <input
                    type="text"
                    value={editFormData.path}
                    onChange={e => setEditFormData({ ...editFormData, path: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>组件路径</label>
                  <input
                    type="text"
                    value={editFormData.component}
                    onChange={e => setEditFormData({ ...editFormData, component: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="form-group">
              <label>图标</label>
              <input
                type="text"
                value={editFormData.icon}
                onChange={e => setEditFormData({ ...editFormData, icon: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>权限编码</label>
              <input
                type="text"
                value={editFormData.permissionCode}
                onChange={e => setEditFormData({ ...editFormData, permissionCode: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>排序</label>
              <input
                type="number"
                value={editFormData.sort}
                onChange={e => setEditFormData({ ...editFormData, sort: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group">
              <label>可见</label>
              <select
                value={editFormData.visible}
                onChange={e => setEditFormData({ ...editFormData, visible: parseInt(e.target.value) })}
              >
                <option value={1}>显示</option>
                <option value={0}>隐藏</option>
              </select>
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
              <button className="btn btn-primary" onClick={handleUpdateMenu}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
