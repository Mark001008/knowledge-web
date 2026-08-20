import { type FormEvent, useEffect, useMemo, useState } from "react";
import { loadUsers } from "../../services/systemApi";
import {
  addSpaceMember,
  createChatSession,
  createKnowledgeSpace,
  createOnlineDocument,
  deleteChatSession,
  deleteDocument,
  deleteKnowledgeSpace,
  diagnoseChatQuery,
  downloadOriginalDocument,
  getDocumentContent,
  listRecentSessions,
  loadKnowledgeSpace,
  loadSpaceDetail,
  loadWorkspace,
  reindexDocument,
  removeSpaceMember,
  streamChatMessage,
  submitChatFeedback,
  updateChatSession,
  updateDocumentContent,
  updateKnowledgeSpace,
  uploadDocument
} from "../../services/workspaceApi";
import type { ChatMessage, Citation, DocumentStatus, KnowledgeDocument, KnowledgeSpace, RouteKey, DetailTab, UserInfo } from "../../shared/types/domain";
import type { MenuDTO, UserDTO } from "../../shared/types/system";
import { UserListPage } from "../system/users/UserListPage";
import { RoleListPage } from "../system/roles/RoleListPage";
import { MenuListPage } from "../system/menus/MenuListPage";
import { PermissionListPage } from "../system/permissions/PermissionListPage";
import { NoPermissionPage } from "../../shared/components/NoPermissionPage";
import { SystemConfirmDialog, type ConfirmState } from "../system/components/SystemFeedback";
import type { BusyAction, DocumentPageState } from "./workspace-types";
import { WorkspaceHome } from "./SpaceSidebar";
import { SpaceDetail } from "./SpaceDetail";
import { DocumentPage } from "./DocumentList";

interface WorkspaceAppProps {
  token: string;
  user: UserInfo;
  permissions: string[];
  menus: MenuDTO[];
  onLogout: () => void;
}

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
    const draftAssistantId = -Date.now();
    updateActiveSpace((space) => ({
      ...space,
      sessions: (space.sessions ?? []).map((item) =>
        item.id === session.id
          ? {
              ...item,
              messages: [
                ...item.messages,
                { role: "user", content: input },
                { id: draftAssistantId, role: "assistant", content: "", citations: [], diagnostics: null }
              ],
              updatedAt: "刚刚"
            }
          : item
      )
    }));

    try {
      const answer = await runBusy("send-question", () =>
        streamChatMessage(token, session.id, input, {
          onDelta: (delta) => {
            updateActiveSpace((space) => ({
              ...space,
              sessions: (space.sessions ?? []).map((item) =>
                item.id === session.id
                  ? {
                      ...item,
                      messages: item.messages.map((message) =>
                        message.id === draftAssistantId ? { ...message, content: `${message.content}${delta}` } : message
                      ),
                      updatedAt: "刚刚"
                    }
                  : item
              )
            }));
          }
        })
      );
      updateActiveSpace((space) => ({
        ...space,
        sessions: (space.sessions ?? []).map((item) =>
          item.id === session.id
            ? {
                ...item,
                messages: item.messages.map((message) => (message.id === draftAssistantId ? answer : message)),
                updatedAt: "刚刚"
              }
            : item
        )
      }));
    } catch (error) {
      updateActiveSpace((space) => ({
        ...space,
        sessions: (space.sessions ?? []).map((item) =>
          item.id === session.id
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  message.id === draftAssistantId
                    ? { ...message, content: message.content || "流式问答失败，请稍后重试。" }
                    : message
                )
              }
            : item
        )
      }));
      setApiError(errorMessage(error));
    }
  }

  async function sendFeedback(message: ChatMessage, rating: string, reason = "") {
    if (!message.id) {
      setApiError("这条历史回答缺少消息编号，暂时无法提交反馈");
      return;
    }
    setApiError("");
    try {
      await submitChatFeedback(token, message.id, rating, reason);
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  async function diagnoseQuestion(spaceId: number, question: string) {
    return runBusy("diagnose-question", () => diagnoseChatQuery(token, spaceId, question));
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
            onDiagnoseQuestion={diagnoseQuestion}
            onFeedback={sendFeedback}
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

function isProcessingStatus(status: DocumentStatus) {
  return status === "PENDING" || status === "PARSING" || status === "INDEXING";
}

function errorMessage(error: unknown) {
  return error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message;
}
