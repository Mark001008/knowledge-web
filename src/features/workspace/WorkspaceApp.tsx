import { type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { marked } from "marked";
import { MarkdownRenderer } from "../../components/ui/MarkdownRenderer";
import { loadUsers } from "../../services/systemApi";
import {
  addSpaceMember,
  createChatSession,
  createKnowledgeSpace,
  createOnlineDocument,
  deleteChatSession,
  deleteDocument,
  deleteKnowledgeSpace,
  downloadOriginalDocument,
  getDocumentContent,
  listRecentSessions,
  loadKnowledgeSpace,
  loadSpaceDetail,
  loadWorkspace,
  reindexDocument,
  removeSpaceMember,
  sendChatMessage,
  updateChatSession,
  updateDocumentContent,
  updateKnowledgeSpace,
  uploadDocument
} from "../../services/workspaceApi";
import { statusClass, statusLabel } from "../../shared/status";
import type { ChatMessage, Citation, DetailTab, DocumentStatus, KnowledgeDocument, KnowledgeSpace, RouteKey, UserInfo } from "../../shared/types/domain";
import type { MenuDTO, UserDTO } from "../../shared/types/system";
import { UserListPage } from "../system/users/UserListPage";
import { RoleListPage } from "../system/roles/RoleListPage";
import { MenuListPage } from "../system/menus/MenuListPage";
import { PermissionListPage } from "../system/permissions/PermissionListPage";
import { NoPermissionPage } from "../../shared/components/NoPermissionPage";
import { SystemConfirmDialog, type ConfirmState } from "../system/components/SystemFeedback";

interface WorkspaceAppProps {
  token: string;
  user: UserInfo;
  permissions: string[];
  menus: MenuDTO[];
  onLogout: () => void;
}

type BusyAction =
  | "create-space"
  | "refresh-space"
  | "save-settings"
  | "delete-space"
  | "add-member"
  | "create-session"
  | "send-question"
  | "create-online-document"
  | "save-online-document"
  | `upload-${number}`
  | `delete-document-${number}`
  | `download-document-${number}`
  | `edit-document-${number}`
  | `view-document-${number}`
  | `reindex-document-${number}`
  | `remove-member-${number}`;

const busyText: Partial<Record<BusyAction, string>> = {
  "create-space": "创建中",
  "refresh-space": "刷新中",
  "save-settings": "保存中",
  "delete-space": "删除中",
  "add-member": "添加中",
  "create-session": "新建中",
  "send-question": "发送中",
  "create-online-document": "创建中",
  "save-online-document": "保存中"
};

interface DocumentContentState {
  documentId: number;
  title: string;
  content: string;
  fileType: string;
  status: DocumentStatus;
  editable: boolean;
}

type DocumentPageState =
  | {
      mode: "create";
      title: string;
      content: string;
      fileType: "MARKDOWN";
    }
  | ({
      mode: "view";
    } & DocumentContentState)
  | ({
      mode: "edit";
    } & DocumentContentState);

type AnswerMode = "strict" | "balanced" | "broad";

export function WorkspaceApp({ token, user, permissions, menus, onLogout }: WorkspaceAppProps) {
  const [route, setRoute] = useState<RouteKey>("spaces");
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("documents");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [recentSessions, setRecentSessions] = useState<Array<{ sessionId: number; spaceId: number; spaceName: string; title: string; updatedAt: string }>>([]);
  const [keyword, setKeyword] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [documentPage, setDocumentPage] = useState<DocumentPageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [busyActions, setBusyActions] = useState<Set<BusyAction>>(new Set());
  const [userDirectory, setUserDirectory] = useState<UserDTO[]>([]);
  const [userDirectoryError, setUserDirectoryError] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const displayName = user.displayName || user.username || "管理员";

  // 权限检查函数
  const hasPermission = (code: string) => permissions.includes(code);
  const hasAnyPermission = (codes: string[]) => codes.some(code => permissions.includes(code));
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || null;
  const activeSession = activeSpace?.sessions?.find((session) => session.id === activeSessionId) || activeSpace?.sessions?.[0] || null;
  const allDocuments = useMemo(() => spaces.flatMap((space) => space.documents ?? []), [spaces]);
  const processingDocuments = allDocuments.filter((doc) => isProcessingStatus(doc.status));
  const filteredSpaces = spaces.filter((space) => {
    const query = keyword.trim().toLowerCase();
    return !query || `${space.name} ${space.description}`.toLowerCase().includes(query);
  });
  const isBusy = (action: BusyAction) => busyActions.has(action);

  // 浏览器 History 集成：前进/回退支持
  useEffect(() => {
    window.history.replaceState({ route: "spaces" }, "", "/");
    function handlePopState(event: PopStateEvent) {
      const state = event.state as { route?: RouteKey } | null;
      const restoredRoute = state?.route || "spaces";
      setRoute(restoredRoute);
      setActiveSpaceId(null);
      setDocumentPage(null);
      setCitation(null);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    refreshWorkspace();
  }, [token]);

  useEffect(() => {
    if (!permissions.includes("user:view")) {
      setUserDirectory([]);
      setUserDirectoryError("");
      return;
    }

    let cancelled = false;
    loadUsers()
      .then((users) => {
        if (!cancelled) {
          setUserDirectory(users);
          setUserDirectoryError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setUserDirectory([]);
          setUserDirectoryError(errorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, permissions]);

  useEffect(() => {
    if (!processingDocuments.length || loading) return;
    const timer = window.setInterval(() => {
      refreshWorkspace(true);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [processingDocuments.length, loading, token]);

  async function runBusy<T>(action: BusyAction, task: () => Promise<T>) {
    setBusyActions((current) => new Set(current).add(action));
    try {
      return await task();
    } finally {
      setBusyActions((current) => {
        const next = new Set(current);
        next.delete(action);
        return next;
      });
    }
  }

  async function refreshWorkspace(silent = false) {
    if (!silent) {
      setLoading(true);
    }
    setApiError("");
    try {
      const [nextSpaces, sessions] = await Promise.all([
        loadWorkspace(token),
        listRecentSessions(token, 20)
      ]);
      setSpaces(nextSpaces);
      setRecentSessions(sessions);
      if (activeSpaceId && !nextSpaces.some((space) => space.id === activeSpaceId)) {
        setActiveSpaceId(null);
        setActiveSessionId(null);
      }
    } catch (error) {
      setApiError(errorMessage(error));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  function openRoute(nextRoute: RouteKey) {
    setRoute(nextRoute);
    setActiveSpaceId(null);
    setDocumentPage(null);
    setCitation(null);
    window.history.pushState({ route: nextRoute }, "", `/${nextRoute}`);
  }

  async function openSpace(spaceId: number, tab: DetailTab = "documents", sessionId?: number) {
    const nextSpace = spaces.find((space) => space.id === spaceId);
    setRoute("spaces");
    setActiveSpaceId(spaceId);
    setActiveTab(tab);
    setActiveSessionId(sessionId || nextSpace?.sessions?.[0]?.id || null);
    setDocumentPage(null);
    setCitation(null);

    // 延迟加载：如果空间详情未加载，则加载
    if (nextSpace && !nextSpace.loaded) {
      try {
        const detail = await loadSpaceDetail(token, spaceId);
        setSpaces((current) => current.map((s) => (s.id === spaceId ? detail : s)));
        setActiveSessionId((prev) => prev || detail.sessions?.[0]?.id || null);
      } catch (error) {
        setApiError(errorMessage(error));
      }
    }
  }

  function closeDocumentPage() {
    setDocumentPage(null);
    setActiveTab("documents");
  }

  function updateActiveSpace(updater: (space: KnowledgeSpace) => KnowledgeSpace) {
    if (!activeSpace) return;
    setSpaces((current) => current.map((space) => (space.id === activeSpace.id ? updater(space) : space)));
  }

  function replaceSpace(nextSpace: KnowledgeSpace) {
    setSpaces((current) => current.map((space) => (space.id === nextSpace.id ? nextSpace : space)));
    setActiveSessionId((current) => (current && (nextSpace.sessions ?? []).some((session) => session.id === current) ? current : nextSpace.sessions?.[0]?.id || null));
  }

  async function createSpace() {
    if (isBusy("create-space")) return;
    setApiError("");
    try {
      const nextSpace = await runBusy("create-space", () => createKnowledgeSpace(token));
      setSpaces((current) => [nextSpace, ...current]);
      openSpace(nextSpace.id);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function refreshActiveSpace() {
    if (!activeSpace || isBusy("refresh-space")) return;
    setApiError("");
    try {
      const nextSpace = await runBusy("refresh-space", () => loadKnowledgeSpace(token, activeSpace.id));
      replaceSpace(nextSpace);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function updateSpaceSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSpace || isBusy("save-settings")) return;
    const data = new FormData(event.currentTarget);
    setApiError("");
    try {
      const nextSpace = await runBusy("save-settings", () =>
        updateKnowledgeSpace(token, activeSpace.id, {
          name: data.get("name")?.toString().trim() || activeSpace.name,
          description: data.get("description")?.toString().trim() || "",
          visibility: data.get("visibility")?.toString() === "INTERNAL" ? "INTERNAL" : "PRIVATE",
          topK: Number(data.get("topK") || activeSpace.topK),
          similarityThreshold: Number(data.get("threshold") || activeSpace.threshold),
          temperature: Number(data.get("temperature") || activeSpace.temperature)
        })
      );
      replaceSpace(nextSpace);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function deleteSpaceConfirmed(spaceId: number) {
    setApiError("");
    try {
      await runBusy("delete-space", () => deleteKnowledgeSpace(token, spaceId));
      setSpaces((current) => current.filter((space) => space.id !== spaceId));
      if (activeSpaceId === spaceId) {
        setActiveSpaceId(null);
        setActiveSessionId(null);
        setCitation(null);
      }
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  function handleDeleteSpace() {
    if (!activeSpace || isBusy("delete-space")) return;
    const space = activeSpace;
    setConfirm({
      title: `删除知识库「${space.name}」`,
      description: "删除后，该知识库下的文档、成员配置和问答会话都将不可恢复。",
      actionLabel: "删除",
      onConfirm: () => deleteSpaceConfirmed(space.id)
    });
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSpace || isBusy("add-member")) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = Number(data.get("userId"));
    const role = data.get("role")?.toString() || "READER";
    if (!Number.isFinite(userId) || userId <= 0) {
      setApiError("请输入有效的用户 ID");
      return;
    }
    setApiError("");
    try {
      const nextSpace = await runBusy("add-member", () => addSpaceMember(token, activeSpace.id, userId, role));
      replaceSpace(nextSpace);
      form.reset();
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function removeMember(memberId: number) {
    if (!activeSpace || isBusy(`remove-member-${memberId}`)) return;
    setApiError("");
    try {
      const nextSpace = await runBusy(`remove-member-${memberId}`, () => removeSpaceMember(token, activeSpace.id, memberId));
      replaceSpace(nextSpace);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function createSession() {
    if (!activeSpace || isBusy("create-session")) return null;
    if (!permissions.includes("qa:create")) {
      setApiError("当前账号没有创建问答会话权限");
      return null;
    }
    setApiError("");
    try {
      const session = await runBusy("create-session", () => createChatSession(token, activeSpace.id));
      updateActiveSpace((space) => ({ ...space, sessions: [session, ...(space.sessions ?? [])] }));
      setActiveSessionId(session.id);
      setCitation(null);
      return session;
    } catch (error) {
      setApiError(errorMessage(error));
      return null;
    }
  }

  async function renameSession(sessionId: number, newTitle: string) {
    if (!activeSpace) return;
    if (!permissions.includes("qa:update")) {
      setApiError("当前账号没有编辑问答会话权限");
      return;
    }
    setApiError("");
    try {
      await updateChatSession(token, sessionId, newTitle);
      updateActiveSpace((space) => ({
        ...space,
        sessions: (space.sessions ?? []).map((item) =>
          item.id === sessionId ? { ...item, title: newTitle } : item
        )
      }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function deleteSessionConfirmed(sessionId: number) {
    if (!activeSpace) return;
    setApiError("");
    try {
      await deleteChatSession(token, sessionId);
      updateActiveSpace((space) => ({
        ...space,
        sessions: (space.sessions ?? []).filter((item) => item.id !== sessionId)
      }));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
      setCitation(null);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  function removeSession(sessionId: number) {
    if (!activeSpace) return;
    if (!permissions.includes("qa:delete")) {
      setApiError("当前账号没有删除问答会话权限");
      return;
    }
    const session = activeSpace.sessions?.find((item) => item.id === sessionId);
    setConfirm({
      title: "删除会话",
      description: `确认删除「${session?.title || "这个会话"}」吗？删除后会话记录不可恢复。`,
      actionLabel: "删除",
      onConfirm: () => deleteSessionConfirmed(sessionId)
    });
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy("send-question")) return;
    const form = event.currentTarget;
    const input = new FormData(form).get("question")?.toString().trim();
    if (!input || !activeSpace) return;

    const session = activeSession || (await createSession());
    if (!session) return;

    form.reset();
    setApiError("");
    updateActiveSpace((space) => ({
      ...space,
      sessions: (space.sessions ?? []).map((item) =>
        item.id === session.id ? { ...item, messages: [...item.messages, { role: "user", content: input }], updatedAt: "刚刚" } : item
      )
    }));

    try {
      const answer = await runBusy("send-question", () => sendChatMessage(token, session.id, input));
      updateActiveSpace((space) => ({
        ...space,
        sessions: (space.sessions ?? []).map((item) =>
          item.id === session.id ? { ...item, messages: [...item.messages, answer], updatedAt: "刚刚" } : item
        )
      }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function addDocument(file: File) {
    if (!activeSpace || isBusy(`upload-${activeSpace.id}`)) return;
    setApiError("");
    try {
      const documents = await runBusy(`upload-${activeSpace.id}`, () => uploadDocument(token, activeSpace.id, file));
      updateActiveSpace((space) => ({ ...space, documents }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function createOnlineDocumentFromEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSpace || !documentPage || documentPage.mode !== "create" || isBusy("create-online-document")) return;
    setApiError("");
    try {
      const documents = await runBusy("create-online-document", () =>
        createOnlineDocument(token, activeSpace.id, documentPage.title, documentPage.content)
      );
      updateActiveSpace((space) => ({ ...space, documents }));
      setDocumentPage(null);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function openEditOnlineDocument(document: KnowledgeDocument) {
    const action: BusyAction = `edit-document-${document.id}`;
    if (isBusy(action)) return;
    setApiError("");
    try {
      const content = await runBusy(action, () => getDocumentContent(token, document.id));
      setDocumentPage({
        mode: "edit",
        documentId: document.id,
        title: content.title,
        content: content.content,
        fileType: content.fileType,
        status: content.status,
        editable: content.fileType === "MARKDOWN"
      });
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function openViewDocument(document: KnowledgeDocument) {
    const action: BusyAction = `view-document-${document.id}`;
    if (isBusy(action)) return;
    setApiError("");
    try {
      const content = await runBusy(action, () => getDocumentContent(token, document.id));
      setDocumentPage({
        mode: "view",
        documentId: document.id,
        title: content.title,
        content: content.content,
        fileType: content.fileType,
        status: content.status,
        editable: content.fileType === "MARKDOWN"
      });
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function updateOnlineDocumentFromEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSpace || !documentPage || documentPage.mode !== "edit" || !documentPage.documentId || isBusy("save-online-document")) return;
    setApiError("");
    try {
      await runBusy("save-online-document", () =>
        updateDocumentContent(token, documentPage.documentId, documentPage.title, documentPage.content)
      );
      const nextSpace = await loadKnowledgeSpace(token, activeSpace.id);
      replaceSpace(nextSpace);
      setDocumentPage(null);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function handleDeleteDocument(documentId: number) {
    if (!activeSpace || isBusy(`delete-document-${documentId}`)) return;
    setApiError("");
    try {
      await runBusy(`delete-document-${documentId}`, () => deleteDocument(token, documentId));
      updateActiveSpace((space) => ({ ...space, documents: (space.documents ?? []).filter((doc) => doc.id !== documentId) }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function handleReindexDocument(documentId: number) {
    if (isBusy(`reindex-document-${documentId}`)) return;
    setApiError("");
    try {
      await runBusy(`reindex-document-${documentId}`, () => reindexDocument(token, documentId));
      updateActiveSpace((space) => ({
        ...space,
        documents: (space.documents ?? []).map((doc) => (doc.id === documentId ? { ...doc, status: "PENDING", errorMessage: "", updatedAt: "刚刚" } : doc))
      }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function handleDownloadDocumentSource(documentId: number, fileName: string) {
    if (!permissions.includes("document:download")) {
      setApiError("当前账号没有下载原文权限");
      return;
    }
    const action: BusyAction = `download-document-${documentId}`;
    if (isBusy(action)) return;
    setApiError("");
    try {
      await runBusy(action, () => downloadOriginalDocument(token, documentId, fileName));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function handleDownloadDocument(document: KnowledgeDocument) {
    await handleDownloadDocumentSource(document.id, document.fileName);
  }

  const title = documentPage ? documentPage.title : route === "recent" ? "最近问答" : activeSpace ? activeSpace.name : "知识库";
  const editingDocument = documentPage?.mode === "create" || documentPage?.mode === "edit";

  return (
    <main className={`app-shell ${editingDocument ? "editing-document" : ""}`}>
      {!editingDocument ? (
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">KB</span>
          <span>MarkVerse</span>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {menus.map((menu) => (
            <button
              key={menu.path}
              className={`nav-item ${route === menu.path?.replace('/', '') ? "active" : ""}`}
              type="button"
              onClick={() => {
                if (menu.path === '/workspace') {
                  openRoute('spaces');
                } else if (menu.path === '/recent-qa') {
                  openRoute('recent');
                } else if (menu.path?.startsWith('/system')) {
                  openRoute('system');
                }
              }}
            >
              {menu.menuName}
            </button>
          ))}
        </nav>
        <div className="app-header-actions">
          <div className="user-chip">{displayName}</div>
          <button className="secondary-btn" type="button" onClick={onLogout}>
            退出
          </button>
        </div>
      </header>
      ) : null}

      <section className={editingDocument ? "workspace document-workspace" : "workspace"}>

        {apiError ? <div className="notice error">{apiError}</div> : null}
        <SystemConfirmDialog confirm={confirm} onOpenChange={(open) => !open && setConfirm(null)} />
        {loading ? <EmptyState title="正在加载知识库数据" text="正在读取当前账号可访问的知识库、文档和会话。" /> : null}

        {!loading && route === "spaces" && !activeSpace ? (
          <WorkspaceHome
            spaces={filteredSpaces}
            allSpaces={spaces}
            documents={allDocuments}
            processingDocuments={processingDocuments}
            recentSessions={recentSessions}
            keyword={keyword}
            onKeywordChange={setKeyword}
            onCreateSpace={createSpace}
            onOpenSpace={openSpace}
            creating={isBusy("create-space")}
          />
        ) : null}

        {!loading && route === "spaces" && activeSpace && documentPage ? (
          <DocumentPage
            page={documentPage}
            saving={isBusy(documentPage.mode === "create" ? "create-online-document" : "save-online-document")}
            onChange={setDocumentPage}
            onSubmit={documentPage.mode === "create" ? createOnlineDocumentFromEditor : updateOnlineDocumentFromEditor}
            onEdit={() => {
              if (documentPage.mode === "view" && documentPage.editable) {
                setDocumentPage({ ...documentPage, mode: "edit" });
              }
            }}
            onBack={closeDocumentPage}
          />
        ) : null}

        {!loading && route === "spaces" && activeSpace && !documentPage ? (
          <SpaceDetail
            space={activeSpace}
            activeTab={activeTab}
            activeSessionId={activeSession?.id || null}
            citation={citation}
            busyActions={busyActions}
            permissions={permissions}
            userDirectory={userDirectory}
            userDirectoryError={userDirectoryError}
            onTabChange={setActiveTab}
            onUpload={addDocument}
            onCreateOnlineDocument={() => setDocumentPage({ mode: "create", title: "未命名文档", content: "", fileType: "MARKDOWN" })}
            onViewDocument={openViewDocument}
            onEditOnlineDocument={openEditOnlineDocument}
            onDownloadDocument={handleDownloadDocument}
            onDownloadSource={handleDownloadDocumentSource}
            onDeleteDocument={handleDeleteDocument}
            onReindexDocument={handleReindexDocument}
            onRefresh={refreshActiveSpace}
            onSelectSession={setActiveSessionId}
            onCreateSession={createSession}
            onRenameSession={renameSession}
            onDeleteSession={removeSession}
            onSubmitQuestion={sendQuestion}
            onSelectCitation={setCitation}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onSubmitSettings={updateSpaceSettings}
            onDeleteSpace={handleDeleteSpace}
          />
        ) : null}

        {!loading && route === "recent" ? <RecentQuestions sessions={recentSessions} onOpenSession={(spaceId, sessionId) => openSpace(spaceId, "chat", sessionId)} /> : null}

        {!loading && route === "system" ? (
          <SystemManagement
            menus={menus}
            permissions={permissions}
            token={token}
          />
        ) : null}
      </section>
    </main>
  );
}

function SystemManagement({
  menus,
  permissions,
  token
}: {
  menus: MenuDTO[];
  permissions: string[];
  token: string;
}) {
  const [activePage, setActivePage] = useState<string>("users");

  // 权限检查函数
  const hasPermission = (code: string) => permissions.includes(code);
  const hasAnyPermission = (codes: string[]) => codes.some(code => permissions.includes(code));

  // 检查是否有系统管理权限
  const hasSystemPermission = hasAnyPermission([
    "user:view", "role:view", "menu:view", "permission:view"
  ]);

  if (!hasSystemPermission) {
    return <NoPermissionPage />;
  }

  return (
    <div className="system-management">
      <div className="system-sidebar">
        <h3>系统管理</h3>
        <nav className="system-nav">
          {hasPermission("user:view") && (
            <button
              className={`system-nav-item ${activePage === "users" ? "active" : ""}`}
              onClick={() => setActivePage("users")}
            >
              用户管理
            </button>
          )}
          {hasPermission("role:view") && (
            <button
              className={`system-nav-item ${activePage === "roles" ? "active" : ""}`}
              onClick={() => setActivePage("roles")}
            >
              角色管理
            </button>
          )}
          {hasPermission("menu:view") && (
            <button
              className={`system-nav-item ${activePage === "menus" ? "active" : ""}`}
              onClick={() => setActivePage("menus")}
            >
              菜单管理
            </button>
          )}
          {hasPermission("permission:view") && (
            <button
              className={`system-nav-item ${activePage === "permissions" ? "active" : ""}`}
              onClick={() => setActivePage("permissions")}
            >
              权限管理
            </button>
          )}
        </nav>
      </div>
      <div className="system-content">
        {activePage === "users" && hasPermission("user:view") && (
          <UserListPage token={token} />
        )}
        {activePage === "roles" && hasPermission("role:view") && (
          <RoleListPage token={token} />
        )}
        {activePage === "menus" && hasPermission("menu:view") && (
          <MenuListPage token={token} />
        )}
        {activePage === "permissions" && hasPermission("permission:view") && (
          <PermissionListPage token={token} />
        )}
      </div>
    </div>
  );
}

function WorkspaceHome({
  spaces,
  allSpaces,
  documents,
  processingDocuments,
  recentSessions,
  keyword,
  onKeywordChange,
  onCreateSpace,
  onOpenSpace,
  creating
}: {
  spaces: KnowledgeSpace[];
  allSpaces: KnowledgeSpace[];
  documents: KnowledgeDocument[];
  processingDocuments: KnowledgeDocument[];
  recentSessions: Array<{ sessionId: number; spaceId: number; spaceName: string; title: string; updatedAt: string }>;
  keyword: string;
  onKeywordChange: (value: string) => void;
  onCreateSpace: () => void;
  onOpenSpace: (spaceId: number, tab?: DetailTab, sessionId?: number) => void;
  creating: boolean;
}) {
  const completedCount = documents.filter((doc) => doc.status === "COMPLETED").length;
  const failedCount = documents.filter((doc) => doc.status === "FAILED").length;

  return (
    <section className="page-stack">
      <div className="overview-grid">
        <SummaryCard label="知识库" value={allSpaces.length} />
        <SummaryCard label="文档" value={documents.length} />
        <SummaryCard label="已完成" value={completedCount} />
        <SummaryCard label="需处理" value={processingDocuments.length + failedCount} tone={failedCount ? "warning" : "default"} />
      </div>

      <section className="surface">
        <div className="section-header">
          <div>
            <h3>知识库列表</h3>
            <p>只展示当前账号有权限访问的知识库。</p>
          </div>
          <div className="inline-actions">
            <div className="search-wrapper">
              <span className="search-icon">🔍</span>
              <input
                className="search-input"
                placeholder="搜索知识库名称或描述..."
                value={keyword}
                onChange={(event) => onKeywordChange(event.target.value)}
              />
              {keyword && (
                <button
                  className="search-clear"
                  type="button"
                  onClick={() => onKeywordChange("")}
                  title="清除搜索"
                >
                  ✕
                </button>
              )}
            </div>
            <button className="primary-btn" type="button" onClick={onCreateSpace} disabled={creating}>
              {creating ? "创建中" : "创建知识库"}
            </button>
          </div>
        </div>
        {keyword && (
          <div className="search-result-info">
            找到 {spaces.length} 个匹配的知识库
          </div>
        )}
        <div className="space-grid">
          {spaces.map((space) => (
            <article className="space-card" key={space.id}>
              <div className="space-card-head">
                <h4>{space.name}</h4>
                <span className="pill">{visibilityLabel(space.visibility)}</span>
              </div>
              <p>{space.description || "暂无描述"}</p>
              <div className="card-meta">
                {space.loaded ? (
                  <>
                    <span>{space.documents?.length ?? 0} 个文档</span>
                    <span>{space.sessions?.length ?? 0} 个会话</span>
                  </>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>点击进入查看详情</span>
                )}
                <span>{space.updatedAt}</span>
              </div>
              <button className="secondary-btn full-width" type="button" onClick={() => onOpenSpace(space.id)}>
                进入知识库
              </button>
            </article>
          ))}
          {!spaces.length ? <EmptyState title="暂无知识库" text="创建一个知识库后，就可以上传文档并围绕资料提问。" actionLabel="创建知识库" onAction={onCreateSpace} /> : null}
        </div>
      </section>

      <section className="home-bottom-grid">
        <ProcessingPanel spaces={allSpaces} />
        <RecentPanel sessions={recentSessions.slice(0, 5)} onOpenSession={onOpenSpace} />
      </section>
    </section>
  );
}

function SpaceDetail({
  space,
  activeTab,
  activeSessionId,
  citation,
  busyActions,
  permissions,
  userDirectory,
  userDirectoryError,
  onTabChange,
  onUpload,
  onCreateOnlineDocument,
  onViewDocument,
  onEditOnlineDocument,
  onDownloadDocument,
  onDownloadSource,
  onDeleteDocument,
  onReindexDocument,
  onRefresh,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onSubmitQuestion,
  onSelectCitation,
  onAddMember,
  onRemoveMember,
  onSubmitSettings,
  onDeleteSpace
}: {
  space: KnowledgeSpace;
  activeTab: DetailTab;
  activeSessionId: number | null;
  citation: Citation | null;
  busyActions: Set<BusyAction>;
  permissions: string[];
  userDirectory: UserDTO[];
  userDirectoryError: string;
  onTabChange: (tab: DetailTab) => void;
  onUpload: (file: File) => void;
  onCreateOnlineDocument: () => void;
  onViewDocument: (document: KnowledgeDocument) => void;
  onEditOnlineDocument: (document: KnowledgeDocument) => void;
  onDownloadDocument: (document: KnowledgeDocument) => void;
  onDownloadSource: (documentId: number, fileName: string) => void;
  onDeleteDocument: (documentId: number) => void;
  onReindexDocument: (documentId: number) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: number, newTitle: string) => void;
  onDeleteSession: (sessionId: number) => void;
  onSubmitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onSelectCitation: (citation: Citation) => void;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveMember: (memberId: number) => void;
  onSubmitSettings: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteSpace: () => void;
}) {
  // 权限检查函数
  const hasPermission = (code: string) => permissions.includes(code);
  return (
    <section className="page-stack">
      <div className="tabs" role="tablist">
        {[
          ["documents", "文档"],
          ["chat", "问答"],
          ["members", "成员"],
          ["settings", "配置"]
        ].map(([key, label]) => (
          <button key={key} className={`tab ${activeTab === key ? "active" : ""}`} type="button" onClick={() => onTabChange(key as DetailTab)}>
            {label}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "documents" ? (
          <DocumentsTab
            space={space}
            uploading={busyActions.has(`upload-${space.id}`)}
            refreshing={busyActions.has("refresh-space")}
            busyActions={busyActions}
            permissions={permissions}
            onUpload={onUpload}
            onCreateOnlineDocument={onCreateOnlineDocument}
            onViewDocument={onViewDocument}
            onEditOnlineDocument={onEditOnlineDocument}
            onDownloadDocument={onDownloadDocument}
            onDelete={onDeleteDocument}
            onReindex={onReindexDocument}
            onRefresh={onRefresh}
          />
        ) : null}
        {activeTab === "chat" ? (
          <ChatTab
            space={space}
            activeSessionId={activeSessionId}
            creatingSession={busyActions.has("create-session")}
            sending={busyActions.has("send-question")}
            onSelectSession={onSelectSession}
            onCreateSession={onCreateSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
            onSubmitQuestion={onSubmitQuestion}
            onSelectCitation={onSelectCitation}
            onDownloadSource={onDownloadSource}
            onViewSourceDocument={onViewDocument}
            canCreateSession={hasPermission("qa:create")}
            canUpdateSession={hasPermission("qa:update")}
            canDeleteSession={hasPermission("qa:delete")}
            canDownloadSource={hasPermission("document:download")}
            citation={citation}
          />
        ) : null}
        {activeTab === "members" ? (
          <MembersTab
            space={space}
            users={userDirectory}
            userDirectoryError={userDirectoryError}
            adding={busyActions.has("add-member")}
            busyActions={busyActions}
            onAddMember={onAddMember}
            onRemoveMember={onRemoveMember}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsTab
            space={space}
            saving={busyActions.has("save-settings")}
            deleting={busyActions.has("delete-space")}
            onSubmit={onSubmitSettings}
            onDelete={onDeleteSpace}
          />
        ) : null}
      </div>
    </section>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <article className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProcessingPanel({ spaces }: { spaces: KnowledgeSpace[] }) {
  const items = spaces.flatMap((space) =>
    (space.documents ?? [])
      .filter((doc) => doc.status !== "COMPLETED")
      .map((doc) => ({
        ...doc,
        spaceName: space.name
      }))
  );
  return (
    <section className="surface">
      <div className="section-header compact">
        <h3>文档状态</h3>
      </div>
      <div className="simple-list">
        {items.slice(0, 6).map((doc) => (
          <article className="list-row" key={`${doc.spaceName}-${doc.id}`}>
            <div>
              <strong>{doc.fileName}</strong>
              <span>{doc.spaceName} · {doc.updatedAt}</span>
            </div>
            <span className={`pill ${statusClass(doc.status)}`}>{statusLabel(doc.status)}</span>
          </article>
        ))}
        {!items.length ? <EmptyState title="暂无待处理文档" text="上传后的文档状态会显示在这里。" compact /> : null}
      </div>
    </section>
  );
}

function RecentPanel({
  sessions,
  onOpenSession
}: {
  sessions: Array<{ sessionId: number; spaceId: number; spaceName: string; title: string; updatedAt: string }>;
  onOpenSession: (spaceId: number, tab?: DetailTab, sessionId?: number) => void;
}) {
  return (
    <section className="surface">
      <div className="section-header compact">
        <h3>最近会话</h3>
      </div>
      <div className="simple-list">
        {sessions.map((session) => (
          <button className="list-row as-button" key={`${session.spaceId}-${session.sessionId}`} type="button" onClick={() => onOpenSession(session.spaceId, "chat", session.sessionId)}>
            <div>
              <strong>{session.title}</strong>
              <span>{session.spaceName} · {session.updatedAt}</span>
            </div>
          </button>
        ))}
        {!sessions.length ? <EmptyState title="暂无最近问答" text="在任一知识库中发起问答后，会话会出现在这里。" compact /> : null}
      </div>
    </section>
  );
}

function DocumentsTab({
  space,
  uploading,
  refreshing,
  busyActions,
  permissions,
  onUpload,
  onCreateOnlineDocument,
  onViewDocument,
  onEditOnlineDocument,
  onDownloadDocument,
  onDelete,
  onReindex,
  onRefresh
}: {
  space: KnowledgeSpace;
  uploading: boolean;
  refreshing: boolean;
  busyActions: Set<BusyAction>;
  permissions: string[];
  onUpload: (file: File) => void;
  onCreateOnlineDocument: () => void;
  onViewDocument: (document: KnowledgeDocument) => void;
  onEditOnlineDocument: (document: KnowledgeDocument) => void;
  onDownloadDocument: (document: KnowledgeDocument) => void;
  onDelete: (documentId: number) => void;
  onReindex: (documentId: number) => void;
  onRefresh: () => void;
}) {
  const [docKeyword, setDocKeyword] = useState("");
  const hasPermission = (code: string) => permissions.includes(code);

  const filteredDocs = (space.documents ?? []).filter((doc) => {
    const query = docKeyword.trim().toLowerCase();
    return !query || doc.fileName.toLowerCase().includes(query) || doc.uploadedBy.toLowerCase().includes(query);
  });

  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>文档</h3>
          <p>当前支持 PDF、TXT、Markdown。上传或重建后会完成解析、切片、分片落库，并写入 Qdrant 向量索引。</p>
        </div>
        <button className="secondary-btn" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "刷新中" : "刷新状态"}
        </button>
      </div>
      <div className="document-create-row">
        {hasPermission("document:upload") && <UploadZone onUpload={onUpload} uploading={uploading} />}
        {hasPermission("document:create") && (
          <button className="online-create-btn" type="button" onClick={onCreateOnlineDocument}>
            <strong>新建在线文档</strong>
            <span>直接编写文档内容，保存后自动入库。</span>
          </button>
        )}
      </div>
      <div className="doc-search-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="搜索文档名称或上传人..."
            value={docKeyword}
            onChange={(event) => setDocKeyword(event.target.value)}
          />
          {docKeyword && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setDocKeyword("")}
              title="清除搜索"
            >
              ✕
            </button>
          )}
        </div>
        <span className="doc-count">{filteredDocs.length} / {(space.documents ?? []).length} 个文档</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>文件</th>
              <th>类型</th>
              <th>大小</th>
              <th>上传人</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocs.map((doc) => {
              const deleting = busyActions.has(`delete-document-${doc.id}`);
              const reindexing = busyActions.has(`reindex-document-${doc.id}`);
              const editing = busyActions.has(`edit-document-${doc.id}`);
              const viewing = busyActions.has(`view-document-${doc.id}`);
              const downloading = busyActions.has(`download-document-${doc.id}`);
              const editable = doc.fileType === "MARKDOWN";
              return (
                <tr key={doc.id}>
                  <td>
                    <strong>{doc.fileName}</strong>
                    {doc.errorMessage ? (
                      <div className="inline-error">
                        <strong>{doc.errorMessage}</strong>
                        <span>{documentFailureAdvice(doc.errorMessage)}</span>
                      </div>
                    ) : null}
                  </td>
                  <td><span className={`file-type ${fileTypeClass(doc.fileType)}`}>{fileTypeLabel(doc.fileType)}</span></td>
                  <td>{doc.fileSize}</td>
                  <td>{doc.uploadedBy}</td>
                  <td><span className={`pill ${statusClass(doc.status)}`}>{statusLabel(doc.status)}</span></td>
                  <td>{doc.updatedAt}</td>
                  <td>
                    <div className="document-actions">
                      <button className="link-btn" type="button" onClick={() => onViewDocument(doc)} disabled={viewing || editing || reindexing || deleting}>
                        {viewing ? "打开中" : "查看"}
                      </button>
                      {hasPermission("document:download") ? (
                        <button className="link-btn" type="button" onClick={() => onDownloadDocument(doc)} disabled={downloading || deleting}>
                          {downloading ? "下载中" : "下载原文"}
                        </button>
                      ) : null}
                      {editable && hasPermission("document:update") ? (
                        <button className="link-btn" type="button" onClick={() => onEditOnlineDocument(doc)} disabled={editing || reindexing || deleting}>
                          {editing ? "打开中" : "编辑"}
                        </button>
                      ) : null}
                      {hasPermission("document:rebuild") && (
                        <button className="link-btn" type="button" onClick={() => onReindex(doc.id)} disabled={reindexing || deleting}>
                          {reindexing ? "重建中" : "重建"}
                        </button>
                      )}
                      {hasPermission("document:delete") && (
                        <button className="link-btn danger-link" type="button" onClick={() => onDelete(doc.id)} disabled={deleting || reindexing}>
                          {deleting ? "删除中" : "删除"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!(space.documents ?? []).length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="暂无文档" text="把制度、手册、方案或 FAQ 上传到这里，后续即可围绕资料提问。" compact />
                </td>
              </tr>
            ) : !filteredDocs.length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="没有匹配的文档" text={`未找到与"${docKeyword}"匹配的文档，请尝试其他关键词。`} compact />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UploadZone({ uploading, onUpload }: { uploading: boolean; onUpload: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !uploading) onUpload(file);
  }

  return (
    <label
      className={`upload-zone ${dragging ? "dragging" : ""} ${uploading ? "disabled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".pdf,.txt,.md,.markdown"
        hidden
        disabled={uploading}
        onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}
      />
      <strong>{uploading ? "正在上传文档" : "拖拽文件到这里，或点击选择文档"}</strong>
      <span>当前支持 PDF、TXT、Markdown；Word 文档将在后续版本支持。</span>
    </label>
  );
}

function DocumentPage({
  page,
  saving,
  onChange,
  onSubmit,
  onEdit,
  onBack
}: {
  page: DocumentPageState;
  saving: boolean;
  onChange: (page: DocumentPageState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  if (page.mode === "view") {
    return <DocumentReadPage page={page} onEdit={onEdit} onBack={onBack} />;
  }
  return <DocumentEditPage page={page} saving={saving} onChange={onChange} onSubmit={onSubmit} onBack={onBack} />;
}

function documentFailureAdvice(errorMessage: string) {
  const message = errorMessage.toLowerCase();
  if (message.includes("内容为空") || message.includes("blank") || message.includes("empty")) {
    return "建议：确认文件不是空文档；如果是扫描版 PDF，需要先转换为可复制文本后再上传。";
  }
  if (message.includes("暂不支持") || message.includes("不支持")) {
    return "建议：当前上传 PDF、TXT 或 Markdown；Word、Excel、PPT 请先转为支持格式。";
  }
  if (message.includes("vector") || message.includes("向量") || message.includes("qdrant") || message.includes("milvus")) {
    return "建议：向量服务可能不可用，稍后点击重建；如果持续失败，请检查向量库和模型配置。";
  }
  if (message.includes("读取") || message.includes("解析") || message.includes("pdf")) {
    return "建议：重新导出文件后上传；复杂表格、加密文件或扫描件可能无法稳定解析。";
  }
  return "建议：先点击重建索引；如果仍失败，请重新上传文件或联系管理员查看服务日志。";
}

function DocumentReadPage({
  page,
  onEdit,
  onBack
}: {
  page: Extract<DocumentPageState, { mode: "view" }>;
  onEdit: () => void;
  onBack: () => void;
}) {
  // 将内容转换为 HTML
  const htmlContent = useMemo(() => {
    const content = page.content || "";
    if (!content) return "";

    // 如果已经是 HTML，直接返回
    if (content.trimStart().startsWith("<")) {
      return content;
    }

    // 否则当作 Markdown 转换
    return markdownToHtml(content);
  }, [page.content]);

  return (
    <section className="page-stack document-page">
      <section className="surface document-page-head">
        <div>
          <p className="eyebrow">{fileTypeLabel(page.fileType)} 预览</p>
          <h3>{page.title}</h3>
          <div className="card-meta">
            <span className={`file-type ${fileTypeClass(page.fileType)}`}>{fileTypeLabel(page.fileType)}</span>
            <span className={`pill ${statusClass(page.status)}`}>{statusLabel(page.status)}</span>
          </div>
        </div>
        <div className="inline-actions">
          <button className="secondary-btn" type="button" onClick={onBack}>
            返回列表
          </button>
        </div>
      </section>
      <section className={`surface document-render ${page.fileType.toLowerCase()}`}>
        {page.fileType === "MARKDOWN" ? (
          <MarkdownRenderer content={page.content} className="tiptap-content" />
        ) : (
          <pre>{page.content || "暂无可预览内容。"}</pre>
        )}
      </section>
    </section>
  );
}

function isMarkdown(text: string): boolean {
  // 检测是否是 Markdown 格式（不是以 < 开头的 HTML）
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("<")) return false;
  // 检测常见 Markdown 语法
  return /^#{1,6}\s|^[-*]\s|^>\s|^```|^\d+\.\s|\*\*[^*]+\*\*|__[^_]+__/.test(trimmed);
}

function markdownToHtml(md: string): string {
  try {
    return marked.parse(md, { breaks: true }) as string;
  } catch {
    return md;
  }
}

function DocumentEditPage({
  page,
  saving,
  onChange,
  onSubmit,
  onBack
}: {
  page: Extract<DocumentPageState, { mode: "create" | "edit" }>;
  saving: boolean;
  onChange: (page: DocumentPageState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}) {
  // 将内容转换为 HTML
  const initialContent = useMemo(() => {
    const content = page.content || "";
    if (!content) return "<p></p>";

    // 如果已经是 HTML（以 < 开头），直接返回
    if (content.trimStart().startsWith("<")) {
      return content;
    }

    // 否则当作 Markdown 转换
    return markdownToHtml(content);
  }, [page.content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "开始输入文档内容...",
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChange({ ...page, content: editor.getHTML() });
    },
    editorProps: {
      attributes: {
        class: "tiptap-editor-content",
      },
    },
  });

  // 当内容从外部更新时，同步到编辑器
  useEffect(() => {
    if (editor && page.content) {
      const currentContent = editor.getHTML();
      const newContent = page.content.trimStart().startsWith("<")
        ? page.content
        : markdownToHtml(page.content);

      // 只在内容真正变化时更新，避免循环
      if (currentContent !== newContent) {
        editor.commands.setContent(newContent);
      }
    }
  }, [page.content]);

  return (
    <form className="document-edit-shell" onSubmit={onSubmit}>
      <div className="document-topbar">
        <div className="topbar-spacer" />
        <div className="topbar-center">
          <input
            className="topbar-title-input"
            value={page.title}
            onChange={(event) => onChange({ ...page, title: event.target.value })}
            placeholder="未命名文档"
            disabled={saving}
          />
        </div>
        <div className="topbar-actions">
          <button className="topbar-back-btn" type="button" onClick={onBack} disabled={saving}>
            ← 返回
          </button>
          <button className="topbar-save-btn" type="submit" disabled={saving || !page.title.trim() || !page.content.trim()}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
      <div className="tiptap-toolbar">
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive("bold")}
            title="加粗"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive("italic")}
            title="斜体"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            active={editor?.isActive("underline")}
            title="下划线"
          >
            <u>U</u>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            active={editor?.isActive("strike")}
            title="删除线"
          >
            <s>S</s>
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
            active={editor?.isActive("heading", { level: 1 })}
            title="标题1"
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive("heading", { level: 2 })}
            title="标题2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor?.isActive("heading", { level: 3 })}
            title="标题3"
          >
            H3
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive("bulletList")}
            title="无序列表"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive("orderedList")}
            title="有序列表"
          >
            1.
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive("blockquote")}
            title="引用"
          >
            ❝
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            active={editor?.isActive("codeBlock")}
            title="代码块"
          >
            {'</>'}
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
            title="分割线"
          >
            —
          </ToolbarButton>
          <ToolbarButton
            onClick={() => {
              const url = window.prompt("输入链接地址:");
              if (url) {
                editor?.chain().focus().setLink({ href: url }).run();
              }
            }}
            active={editor?.isActive("link")}
            title="链接"
          >
            🔗
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().undo()}
            title="撤销"
          >
            ↶
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().redo()}
            title="重做"
          >
            ↷
          </ToolbarButton>
        </ToolbarGroup>
      </div>
      <div className="tiptap-wrapper">
        <EditorContent editor={editor} />
      </div>
    </form>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="toolbar-group">{children}</div>;
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`toolbar-btn ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

function MarkdownRender({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="markdown-render">
      {blocks.map((block, index) => renderMarkdownBlock(block, index))}
      {!blocks.length ? <p>暂无内容。</p> : null}
    </div>
  );
}

function renderMarkdownBlock(block: string, index: number) {
  if (block.startsWith("### ")) {
    return <h4 key={index}>{renderInlineMarkdown(block.slice(4))}</h4>;
  }
  if (block.startsWith("## ")) {
    return <h3 key={index}>{renderInlineMarkdown(block.slice(3))}</h3>;
  }
  if (block.startsWith("# ")) {
    return <h2 key={index}>{renderInlineMarkdown(block.slice(2))}</h2>;
  }
  if (block.startsWith("> ")) {
    return <blockquote key={index}>{renderInlineMarkdown(block.replace(/^>\s?/gm, ""))}</blockquote>;
  }
  if (block.startsWith("```")) {
    return <pre key={index}>{block.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, "")}</pre>;
  }
  const lines = block.split("\n");
  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return (
      <ul key={index}>
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInlineMarkdown(line.trim().replace(/^[-*]\s+/, ""))}</li>
        ))}
      </ul>
    );
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
    return (
      <ol key={index}>
        {lines.map((line, lineIndex) => (
          <li key={lineIndex}>{renderInlineMarkdown(line.trim().replace(/^\d+\.\s+/, ""))}</li>
        ))}
      </ol>
    );
  }
  return <p key={index}>{renderInlineMarkdown(lines.join("\n"))}</p>;
}

function renderInlineMarkdown(text: string) {
  // 支持更多行内格式：加粗、斜体、行内代码、删除线、链接
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|~~[^~]+~~|\[([^\]]+)\]\(([^)]+)\))/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 添加匹配前的文本
    if (match.index > lastIndex) {
      parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }

    const matched = match[0];
    const key = `format-${match.index}`;

    if (matched.startsWith("**") && matched.endsWith("**")) {
      // 加粗
      parts.push(<strong key={key}>{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith("*") && matched.endsWith("*") && !matched.startsWith("**")) {
      // 斜体
      parts.push(<em key={key}>{matched.slice(1, -1)}</em>);
    } else if (matched.startsWith("`") && matched.endsWith("`")) {
      // 行内代码
      parts.push(<code key={key} className="inline-code">{matched.slice(1, -1)}</code>);
    } else if (matched.startsWith("~~") && matched.endsWith("~~")) {
      // 删除线
      parts.push(<del key={key}>{matched.slice(2, -2)}</del>);
    } else if (matched.startsWith("[") && matched.includes("](")) {
      // 链接 [text](url)
      const linkText = match[2];
      const linkUrl = match[3];
      parts.push(<a key={key} href={linkUrl} target="_blank" rel="noopener noreferrer">{linkText}</a>);
    } else {
      parts.push(<span key={key}>{matched}</span>);
    }

    lastIndex = match.index + matched.length;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : <span>{text}</span>;
}

function extractOutline(content: string) {
  return content
    .split("\n")
    .map((line) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      return match ? { level: match[1].length, text: match[2].replace(/\*\*/g, "") } : null;
    })
    .filter((item): item is { level: number; text: string } => Boolean(item));
}

function ChatTab({
  space,
  activeSessionId,
  creatingSession,
  sending,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onSubmitQuestion,
  onSelectCitation,
  onDownloadSource,
  onViewSourceDocument,
  canCreateSession,
  canUpdateSession,
  canDeleteSession,
  canDownloadSource,
  citation
}: {
  space: KnowledgeSpace;
  activeSessionId: number | null;
  creatingSession: boolean;
  sending: boolean;
  onSelectSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: number, newTitle: string) => void;
  onDeleteSession: (sessionId: number) => void;
  onSubmitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onSelectCitation: (citation: Citation) => void;
  onDownloadSource: (documentId: number, fileName: string) => void;
  onViewSourceDocument: (document: KnowledgeDocument) => void;
  canCreateSession: boolean;
  canUpdateSession: boolean;
  canDeleteSession: boolean;
  canDownloadSource: boolean;
  citation: Citation | null;
}) {
  const session = (space.sessions ?? []).find((item) => item.id === activeSessionId) || space.sessions?.[0];
  const noCitationNote = buildNoCitationNote(space);
  const citationDocument = citation ? (space.documents ?? []).find((doc) => doc.id === citation.documentId) : null;
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const messageListRef = useRef<HTMLDivElement>(null);

  // 消息更新时自动滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [session?.messages]);

  function handleStartRename(sessionId: number, currentTitle: string) {
    setEditingSessionId(sessionId);
    setEditTitle(currentTitle);
  }

  function handleSaveRename() {
    if (editingSessionId !== null && editTitle.trim()) {
      onRenameSession(editingSessionId, editTitle.trim());
      setEditingSessionId(null);
      setEditTitle("");
    }
  }

  function handleCancelRename() {
    setEditingSessionId(null);
    setEditTitle("");
  }

  return (
    <section className="chat-layout">
      <aside className="surface session-panel">
        <div className="section-header compact">
          <h3>会话</h3>
          {canCreateSession ? (
            <button className="icon-btn" title="新建会话" type="button" onClick={onCreateSession} disabled={creatingSession}>
              +
            </button>
          ) : null}
        </div>
        <div className="session-list">
          {(space.sessions ?? []).map((item) => (
            <div key={item.id} className={`session-item-wrapper ${item.id === session?.id ? "active" : ""}`}>
              {editingSessionId === item.id ? (
                <div className="session-edit-row">
                  <input
                    className="session-edit-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename();
                      if (e.key === "Escape") handleCancelRename();
                    }}
                    autoFocus
                  />
                  <button className="session-edit-btn" type="button" onClick={handleSaveRename}>✓</button>
                  <button className="session-edit-btn" type="button" onClick={handleCancelRename}>✕</button>
                </div>
              ) : (
                <button className="session-item" type="button" onClick={() => onSelectSession(item.id)}>
                  <div className="session-item-content">
                    <strong>{item.title}</strong>
                    <span>{item.updatedAt}</span>
                  </div>
                  {canUpdateSession || canDeleteSession ? (
                    <div className="session-item-actions">
                      {canUpdateSession ? (
                        <button
                          className="session-action-btn"
                          type="button"
                          title="重命名"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(item.id, item.title);
                          }}
                        >
                          ✏️
                        </button>
                      ) : null}
                      {canDeleteSession ? (
                        <button
                          className="session-action-btn"
                          type="button"
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(item.id);
                          }}
                        >
                          🗑️
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              )}
            </div>
          ))}
          {!(space.sessions ?? []).length ? <EmptyState title="暂无会话" text="新建会话后，可以围绕当前知识库资料提问。" compact /> : null}
        </div>
      </aside>

      <section className="surface chat-panel">
        <div className="message-list" ref={messageListRef}>
          {session?.messages.map((message, messageIndex) => (
            <article className={`message ${message.role}`} key={`${message.role}-${messageIndex}`}>
              {message.role === "assistant" ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                <div>{message.content}</div>
              )}
              {message.role === "assistant" ? <RetrievalNote message={message} space={space} fallbackText={noCitationNote} /> : null}
              {message.citations?.length ? (
                <div className="citation-list">
                  {message.citations.map((item) => (
                    <button className="citation-chip" key={item.id} type="button" onClick={() => onSelectCitation(item)}>
                      {item.documentName} · {item.score.toFixed(3)}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {!session ? <EmptyState title="暂无会话" text="先新建一个会话，再询问当前知识库内容。" compact /> : null}
          {sending ? (
            <article className="message assistant pending">
              <strong>正在检索知识库并生成回答</strong>
              <p className="message-note">会优先查找当前知识库中已完成索引的文档，并在回答后附上引用来源。</p>
            </article>
          ) : null}
        </div>
        <form className="chat-input-row" onSubmit={onSubmitQuestion}>
          <input name="question" placeholder="询问当前知识库内容" disabled={sending} />
          <button className="primary-btn" type="submit" disabled={sending}>
            {sending ? "发送中" : "发送"}
          </button>
        </form>
      </section>

      <aside className="surface citation-panel">
        <div className="section-header compact">
          <h3>引用来源</h3>
        </div>
        {citation ? (
          <article className="citation-card">
            <div className="citation-card-head">
              <h4>{citation.documentName}</h4>
              <div className="citation-card-actions">
                {citationDocument ? (
                  <button className="link-btn" type="button" onClick={() => onViewSourceDocument(citationDocument)}>
                    查看解析文本
                  </button>
                ) : null}
                {canDownloadSource ? (
                  <button className="link-btn" type="button" onClick={() => onDownloadSource(citation.documentId, citation.documentName)}>
                    下载原文
                  </button>
                ) : null}
              </div>
            </div>
            <div className="card-meta">
              <span className="pill">页码 {citation.pageNumber || "-"}</span>
              <span className="pill">分片 {citation.chunkIndex}</span>
              <span className="pill success">相似度 {citation.score.toFixed(6)}</span>
            </div>
            <p className="citation-locator">
              核验定位：优先查看原文第 {citation.pageNumber || "-"} 页；若原文页码不可用，可在解析文本中搜索下方引用片段或定位分片 {citation.chunkIndex}。
            </p>
            <MarkdownRenderer content={citation.quoteText} className="quote-box" />
          </article>
        ) : (
          <EmptyState title="暂无引用" text="点击回答中的引用标签后，这里会展示原文片段。" compact />
        )}
      </aside>
    </section>
  );
}

function MembersTab({
  space,
  users,
  userDirectoryError,
  adding,
  busyActions,
  onAddMember,
  onRemoveMember
}: {
  space: KnowledgeSpace;
  users: UserDTO[];
  userDirectoryError: string;
  adding: boolean;
  busyActions: Set<BusyAction>;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveMember: (memberId: number) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const memberIds = new Set((space.members ?? []).map((member) => member.id));
  const availableUsers = users
    .filter((item) => item.status !== "DISABLED" && !memberIds.has(item.id))
    .filter((item) => {
      const query = keyword.trim().toLowerCase();
      if (!query) return true;
      return `${item.displayName} ${item.username} ${item.email ?? ""}`.toLowerCase().includes(query);
    })
    .slice(0, 20);

  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>成员权限</h3>
          <p>按知识库维度管理可访问成员。添加前请确认用户已存在。</p>
        </div>
      </div>
      <form className="member-form" onSubmit={onAddMember}>
        {users.length ? (
          <label className="member-picker">
            成员
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名、用户名或邮箱" />
            <select name="userId" required defaultValue="">
              <option value="" disabled>选择要加入的用户</option>
              {availableUsers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName || item.username}（{item.username}）
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            用户 ID
            <input name="userId" type="number" min="1" placeholder="输入已存在用户 ID" />
          </label>
        )}
        <label>
          角色
          <select name="role" defaultValue="READER">
            <option value="READER">只读用户</option>
            <option value="ADMIN">知识库管理员</option>
          </select>
        </label>
        <button className="primary-btn" type="submit" disabled={adding}>
          {adding ? "添加中" : "添加成员"}
        </button>
      </form>
      {userDirectoryError ? (
        <p className="helper-note">暂时无法读取用户列表，可继续用用户 ID 添加成员。</p>
      ) : null}
      {users.length && !availableUsers.length ? (
        <p className="helper-note">没有匹配的可添加用户，可能已在成员列表中或账号已停用。</p>
      ) : null}
      <div className="member-grid">
        {(space.members ?? []).map((member) => {
          const removing = busyActions.has(`remove-member-${member.id}`);
          return (
            <article className="member-card" key={member.id}>
              <div className="member-avatar">{member.name.slice(0, 1)}</div>
              <div>
                <strong>{member.name}</strong>
                <span>{member.role}</span>
              </div>
              <div className="member-actions">
                <span className="pill success">已启用</span>
                {member.role === "所有者" ? null : (
                  <button className="link-btn danger-link" type="button" onClick={() => onRemoveMember(member.id)} disabled={removing}>
                    {removing ? "移除中" : "移除"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!(space.members ?? []).length ? <EmptyState title="暂无成员" text="当前知识库还没有可展示的成员。" compact /> : null}
      </div>
    </section>
  );
}

function answerModePreset(mode: AnswerMode) {
  if (mode === "strict") {
    return { topK: 3, threshold: 0.78, temperature: 0.1 };
  }
  if (mode === "broad") {
    return { topK: 8, threshold: 0.55, temperature: 0.35 };
  }
  return { topK: 5, threshold: 0.7, temperature: 0.2 };
}

function answerModeMeta(mode: AnswerMode) {
  if (mode === "strict") {
    return { label: "严格", description: "更重视准确性，只引用高相关资料。" };
  }
  if (mode === "broad") {
    return { label: "宽松", description: "扩大检索范围，适合资料分散或提问较模糊。" };
  }
  return { label: "平衡", description: "兼顾引用质量和覆盖范围，适合日常问答。" };
}

function inferAnswerMode(space: KnowledgeSpace): AnswerMode {
  if (space.threshold >= 0.75 && space.topK <= 4 && space.temperature <= 0.15) {
    return "strict";
  }
  if (space.threshold <= 0.6 || space.topK >= 7 || space.temperature >= 0.3) {
    return "broad";
  }
  return "balanced";
}

function SettingsTab({
  space,
  saving,
  deleting,
  onSubmit,
  onDelete
}: {
  space: KnowledgeSpace;
  saving: boolean;
  deleting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  const initialMode = inferAnswerMode(space);
  const [answerMode, setAnswerMode] = useState<AnswerMode>(initialMode);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [params, setParams] = useState(() => ({
    topK: space.topK,
    threshold: space.threshold,
    temperature: space.temperature
  }));

  function applyAnswerMode(mode: AnswerMode) {
    setAnswerMode(mode);
    setParams(answerModePreset(mode));
  }

  return (
    <section className="settings-layout">
      <section className="surface">
        <div className="section-header compact">
          <h3>知识库配置</h3>
        </div>
        <form className="settings-form" onSubmit={onSubmit}>
          <label>
            名称
            <input name="name" defaultValue={space.name} />
          </label>
          <label>
            描述
            <input name="description" defaultValue={space.description} />
          </label>
          <label>
            可见范围
            <select name="visibility" defaultValue={space.visibility}>
              <option value="PRIVATE">私有</option>
              <option value="INTERNAL">企业内部</option>
            </select>
          </label>
          <div className="answer-mode-field">
            <span className="field-label">回答模式</span>
            <div className="answer-mode-options" role="radiogroup" aria-label="回答模式">
              {(["strict", "balanced", "broad"] as AnswerMode[]).map((mode) => {
                const meta = answerModeMeta(mode);
                return (
                  <button
                    key={mode}
                    className={`mode-option ${answerMode === mode ? "active" : ""}`}
                    type="button"
                    onClick={() => applyAnswerMode(mode)}
                  >
                    <strong>{meta.label}</strong>
                    <span>{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button className="link-btn advanced-toggle" type="button" onClick={() => setAdvancedOpen((open) => !open)}>
            {advancedOpen ? "收起高级参数" : "展开高级参数"}
          </button>
          {advancedOpen ? (
            <div className="advanced-settings">
              <label>
                引用片段数
                <input
                  name="topK"
                  type="number"
                  min="1"
                  max="20"
                  value={params.topK}
                  onChange={(event) => setParams((current) => ({ ...current, topK: Number(event.target.value) }))}
                />
              </label>
              <label>
                命中阈值
                <input
                  name="threshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={params.threshold}
                  onChange={(event) => setParams((current) => ({ ...current, threshold: Number(event.target.value) }))}
                />
              </label>
              <label>
                发散程度
                <input
                  name="temperature"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={params.temperature}
                  onChange={(event) => setParams((current) => ({ ...current, temperature: Number(event.target.value) }))}
                />
              </label>
            </div>
          ) : (
            <>
              <input type="hidden" name="topK" value={params.topK} />
              <input type="hidden" name="threshold" value={params.threshold} />
              <input type="hidden" name="temperature" value={params.temperature} />
            </>
          )}
          <div className="settings-actions">
            <button className="primary-btn" type="submit" disabled={saving}>
              {saving ? "保存中" : "保存配置"}
            </button>
            <button className="danger-btn" type="button" onClick={onDelete} disabled={deleting}>
              {deleting ? "删除中" : "删除知识库"}
            </button>
          </div>
        </form>
      </section>
      <section className="surface quiet-panel">
        <h3>当前说明</h3>
        <p>当前部署使用轻量 Qdrant。文档会完成上传、解析、切片、分片落库和向量入库；问答会从当前知识库检索相关片段并返回引用来源。</p>
        <p>历史文档如果是在向量库关闭时上传的，需要执行一次重建，才能进入新的 RAG 检索链路。</p>
      </section>
    </section>
  );
}

function RecentQuestions({
  sessions,
  onOpenSession
}: {
  sessions: Array<{ sessionId: number; spaceId: number; spaceName: string; title: string; updatedAt: string }>;
  onOpenSession: (spaceId: number, sessionId: number) => void;
}) {
  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>最近问答</h3>
          <p>快速回到最近的知识库会话。</p>
        </div>
      </div>
      <div className="recent-list">
        {sessions.map((session) => (
          <button className="recent-item" key={`${session.spaceId}-${session.sessionId}`} type="button" onClick={() => onOpenSession(session.spaceId, session.sessionId)}>
            <strong>{session.title}</strong>
            <span>{session.spaceName} · {session.updatedAt}</span>
          </button>
        ))}
        {!sessions.length ? <EmptyState title="暂无最近问答" text="发起问答后，会话会显示在这里。" /> : null}
      </div>
    </section>
  );
}

function EmptyState({
  title,
  text,
  actionLabel,
  onAction,
  compact = false
}: {
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <strong>{title}</strong>
      <span>{text}</span>
      {actionLabel && onAction ? (
        <button className="secondary-btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function RetrievalNote({
  message,
  space,
  fallbackText
}: {
  message: ChatMessage;
  space: KnowledgeSpace;
  fallbackText: string;
}) {
  const citations = message.citations ?? [];
  if (!citations.length) {
    return <p className="message-note warning">无答案原因：{fallbackText}</p>;
  }

  const uniqueDocuments = new Set(citations.map((item) => item.documentId)).size;
  const bestScore = Math.max(...citations.map((item) => item.score));
  const threshold = space.threshold ?? 0.7;

  if (bestScore < threshold) {
    return (
      <p className="message-note warning">
        低命中：最相关片段相似度 {bestScore.toFixed(3)}，低于当前阈值 {threshold.toFixed(2)}。建议核对引用，或补充更贴近问题的资料。
      </p>
    );
  }

  return (
    <p className="message-note info">
      已命中：从 {uniqueDocuments} 个文档中找到 {citations.length} 个引用片段，最高相似度 {bestScore.toFixed(3)}。
    </p>
  );
}

function isProcessingStatus(status: DocumentStatus) {
  return status === "PENDING" || status === "PARSING" || status === "INDEXING";
}

function buildNoCitationNote(space: KnowledgeSpace) {
  const documents = space.documents ?? [];
  const completed = documents.filter((doc) => doc.status === "COMPLETED").length;
  const processing = documents.filter((doc) => isProcessingStatus(doc.status)).length;
  const failed = documents.filter((doc) => doc.status === "FAILED").length;

  if (!documents.length) {
    return "当前知识库还没有文档。请先上传 PDF、TXT 或 Markdown，并等待索引完成后再提问。";
  }
  if (!completed && processing) {
    return `索引未完成。当前有 ${processing} 个文档仍在处理，暂时不会参与检索；处理完成后再次提问可获得引用来源。`;
  }
  if (!completed && failed) {
    return `索引失败。当前 ${failed} 个文档索引失败，知识库暂无可检索内容；请在文档页查看失败原因并重建索引。`;
  }
  if (processing) {
    return `索引未完全完成。已检索 ${completed} 个完成索引的文档；另有 ${processing} 个文档仍在处理，暂未参与本次回答。`;
  }
  if (failed) {
    return `已检索 ${completed} 个完成索引的文档，但没有命中可引用片段；另有 ${failed} 个失败文档可在文档页处理。`;
  }
  return "已检索当前知识库中完成索引的文档，但相似度未达到可引用标准。可以换一种问法，或补充更相关的资料后再试。";
}

function visibilityLabel(visibility: KnowledgeSpace["visibility"]) {
  return visibility === "INTERNAL" ? "企业内部" : "私有";
}

function fileTypeLabel(fileType: string) {
  return {
    PDF: "PDF",
    TXT: "TXT",
    MARKDOWN: "Markdown",
    DOCX: "Word"
  }[fileType] || fileType || "-";
}

function fileTypeClass(fileType: string) {
  return {
    PDF: "pdf",
    TXT: "txt",
    MARKDOWN: "markdown",
    DOCX: "docx"
  }[fileType] || "unknown";
}

function errorMessage(error: unknown) {
  return error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message;
}
