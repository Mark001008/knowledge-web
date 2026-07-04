import { type DragEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addSpaceMember,
  createChatSession,
  createKnowledgeSpace,
  createOnlineDocument,
  deleteDocument,
  deleteKnowledgeSpace,
  getDocumentContent,
  loadKnowledgeSpace,
  loadWorkspace,
  reindexDocument,
  removeSpaceMember,
  sendChatMessage,
  updateDocumentContent,
  updateKnowledgeSpace,
  uploadDocument
} from "../../services/workspaceApi";
import { statusClass, statusLabel } from "../../shared/status";
import type { Citation, DetailTab, DocumentStatus, KnowledgeDocument, KnowledgeSpace, RouteKey, UserInfo } from "../../shared/types/domain";

interface WorkspaceAppProps {
  token: string;
  user: UserInfo;
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

type EditorFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "bullet"
  | "number"
  | "quote"
  | "divider"
  | "link"
  | "clear"
  | "color"
  | "highlight"
  | "align-left"
  | "align-center"
  | "align-right"
  | "indent"
  | "outdent"
  | "checklist";
type EditorBlock = "p" | "h1" | "h2" | "h3";
type EditorFont = "雅黑" | "宋体" | "黑体" | "等宽";
type EditorSize = "小一" | "正文" | "大";

interface ToolbarState {
  block: EditorBlock;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  bullet: boolean;
  number: boolean;
}

const inlineCommands: Array<{ format: EditorFormat; label: string; title: string; activeKey?: keyof ToolbarState }> = [
  { format: "bold", label: "B", title: "加粗", activeKey: "bold" },
  { format: "italic", label: "I", title: "斜体", activeKey: "italic" },
  { format: "strike", label: "S", title: "删除线", activeKey: "strike" },
  { format: "underline", label: "U", title: "下划线", activeKey: "underline" }
];

const structureCommands: Array<{ format: EditorFormat; label: string; title: string; activeKey?: keyof ToolbarState }> = [
  { format: "bullet", label: "•", title: "项目列表", activeKey: "bullet" },
  { format: "number", label: "1.", title: "编号列表", activeKey: "number" },
  { format: "outdent", label: "←", title: "减少缩进" },
  { format: "indent", label: "→", title: "增加缩进" }
];

const insertCommands: Array<{ format: EditorFormat; label: string; title: string }> = [
  { format: "checklist", label: "☑", title: "待办事项" },
  { format: "link", label: "链接", title: "插入链接" },
  { format: "quote", label: "“”", title: "引用" },
  { format: "divider", label: "—", title: "分割线" }
];

const editorFonts: Record<EditorFont, string> = {
  雅黑: "Microsoft YaHei, PingFang SC, sans-serif",
  宋体: "SimSun, Songti SC, serif",
  黑体: "SimHei, Heiti SC, sans-serif",
  等宽: "Menlo, Consolas, monospace"
};

const editorSizes: Record<EditorSize, string> = {
  小一: "5",
  正文: "4",
  大: "6"
};

export function WorkspaceApp({ token, user, onLogout }: WorkspaceAppProps) {
  const [route, setRoute] = useState<RouteKey>("spaces");
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("documents");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [keyword, setKeyword] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [documentPage, setDocumentPage] = useState<DocumentPageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [busyActions, setBusyActions] = useState<Set<BusyAction>>(new Set());

  const displayName = user.displayName || user.username || "管理员";
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || null;
  const activeSession = activeSpace?.sessions.find((session) => session.id === activeSessionId) || activeSpace?.sessions[0] || null;
  const allDocuments = useMemo(() => spaces.flatMap((space) => space.documents), [spaces]);
  const processingDocuments = allDocuments.filter((doc) => isProcessingStatus(doc.status));
  const recentSessions = spaces
    .flatMap((space) => space.sessions.map((session) => ({ ...session, spaceId: space.id, spaceName: space.name })))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filteredSpaces = spaces.filter((space) => {
    const query = keyword.trim().toLowerCase();
    return !query || `${space.name} ${space.description}`.toLowerCase().includes(query);
  });
  const isBusy = (action: BusyAction) => busyActions.has(action);

  useEffect(() => {
    refreshWorkspace();
  }, [token]);

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

  async function refreshWorkspace() {
    setLoading(true);
    setApiError("");
    try {
      const nextSpaces = await loadWorkspace(token);
      setSpaces(nextSpaces);
      if (activeSpaceId && !nextSpaces.some((space) => space.id === activeSpaceId)) {
        setActiveSpaceId(null);
        setActiveSessionId(null);
      }
    } catch (error) {
      setApiError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function openRoute(nextRoute: RouteKey) {
    setRoute(nextRoute);
    setActiveSpaceId(null);
    setDocumentPage(null);
    setCitation(null);
  }

  function openSpace(spaceId: number, tab: DetailTab = "documents", sessionId?: number) {
    const nextSpace = spaces.find((space) => space.id === spaceId);
    setRoute("spaces");
    setActiveSpaceId(spaceId);
    setActiveTab(tab);
    setActiveSessionId(sessionId || nextSpace?.sessions[0]?.id || null);
    setDocumentPage(null);
    setCitation(null);
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
    setActiveSessionId((current) => (current && nextSpace.sessions.some((session) => session.id === current) ? current : nextSpace.sessions[0]?.id || null));
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

  async function handleDeleteSpace() {
    if (!activeSpace || isBusy("delete-space")) return;
    if (!window.confirm(`确认删除知识库「${activeSpace.name}」吗？`)) return;
    setApiError("");
    try {
      await runBusy("delete-space", () => deleteKnowledgeSpace(token, activeSpace.id));
      setSpaces((current) => current.filter((space) => space.id !== activeSpace.id));
      setActiveSpaceId(null);
      setActiveSessionId(null);
      setCitation(null);
    } catch (error) {
      setApiError(errorMessage(error));
    }
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
    setApiError("");
    try {
      const session = await runBusy("create-session", () => createChatSession(token, activeSpace.id));
      updateActiveSpace((space) => ({ ...space, sessions: [session, ...space.sessions] }));
      setActiveSessionId(session.id);
      setCitation(null);
      return session;
    } catch (error) {
      setApiError(errorMessage(error));
      return null;
    }
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
      sessions: space.sessions.map((item) =>
        item.id === session.id ? { ...item, messages: [...item.messages, { role: "user", content: input }], updatedAt: "刚刚" } : item
      )
    }));

    try {
      const answer = await runBusy("send-question", () => sendChatMessage(token, session.id, input));
      updateActiveSpace((space) => ({
        ...space,
        sessions: space.sessions.map((item) =>
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
      updateActiveSpace((space) => ({ ...space, documents: space.documents.filter((doc) => doc.id !== documentId) }));
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
        documents: space.documents.map((doc) => (doc.id === documentId ? { ...doc, status: "PENDING", errorMessage: "", updatedAt: "刚刚" } : doc))
      }));
    } catch (error) {
      setApiError(errorMessage(error));
    }
  }

  const title = documentPage ? documentPage.title : route === "recent" ? "最近问答" : activeSpace ? activeSpace.name : "知识库";
  const editingDocument = documentPage?.mode === "create" || documentPage?.mode === "edit";

  return (
    <main className={`app-shell ${editingDocument ? "editing-document" : ""}`}>
      {!editingDocument ? (
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">KB</span>
          <span>知识库工作台</span>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {[
            ["spaces", "知识库"],
            ["recent", "最近问答"]
          ].map(([key, label]) => (
            <button key={key} className={`nav-item ${route === key ? "active" : ""}`} type="button" onClick={() => openRoute(key as RouteKey)}>
              {label}
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
        {!editingDocument ? (
        <header className="topbar">
          <div>
            <p className="eyebrow">企业知识库</p>
            <h2>{title}</h2>
          </div>
          {activeSpace ? (
            <button className="secondary-btn" type="button" onClick={documentPage ? closeDocumentPage : () => setActiveSpaceId(null)}>
              {documentPage ? "返回文档列表" : "返回知识库"}
            </button>
          ) : null}
        </header>
        ) : null}

        {apiError ? <div className="notice error">{apiError}</div> : null}
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
            onTabChange={setActiveTab}
            onUpload={addDocument}
            onCreateOnlineDocument={() => setDocumentPage({ mode: "create", title: "未命名文档", content: "", fileType: "MARKDOWN" })}
            onViewDocument={openViewDocument}
            onEditOnlineDocument={openEditOnlineDocument}
            onDeleteDocument={handleDeleteDocument}
            onReindexDocument={handleReindexDocument}
            onRefresh={refreshActiveSpace}
            onSelectSession={setActiveSessionId}
            onCreateSession={createSession}
            onSubmitQuestion={sendQuestion}
            onSelectCitation={setCitation}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onSubmitSettings={updateSpaceSettings}
            onDeleteSpace={handleDeleteSpace}
          />
        ) : null}

        {!loading && route === "recent" ? <RecentQuestions sessions={recentSessions} onOpenSession={(spaceId, sessionId) => openSpace(spaceId, "chat", sessionId)} /> : null}
      </section>
    </main>
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
  recentSessions: Array<{ id: number; title: string; updatedAt: string; spaceId: number; spaceName: string }>;
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
            <input className="search-input" placeholder="搜索知识库" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} />
            <button className="primary-btn" type="button" onClick={onCreateSpace} disabled={creating}>
              {creating ? "创建中" : "创建知识库"}
            </button>
          </div>
        </div>
        <div className="space-grid">
          {spaces.map((space) => (
            <article className="space-card" key={space.id}>
              <div className="space-card-head">
                <h4>{space.name}</h4>
                <span className="pill">{visibilityLabel(space.visibility)}</span>
              </div>
              <p>{space.description || "暂无描述"}</p>
              <div className="card-meta">
                <span>{space.documents.length} 个文档</span>
                <span>{space.sessions.length} 个会话</span>
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
  onTabChange,
  onUpload,
  onCreateOnlineDocument,
  onViewDocument,
  onEditOnlineDocument,
  onDeleteDocument,
  onReindexDocument,
  onRefresh,
  onSelectSession,
  onCreateSession,
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
  onTabChange: (tab: DetailTab) => void;
  onUpload: (file: File) => void;
  onCreateOnlineDocument: () => void;
  onViewDocument: (document: KnowledgeDocument) => void;
  onEditOnlineDocument: (document: KnowledgeDocument) => void;
  onDeleteDocument: (documentId: number) => void;
  onReindexDocument: (documentId: number) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onSubmitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onSelectCitation: (citation: Citation) => void;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveMember: (memberId: number) => void;
  onSubmitSettings: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteSpace: () => void;
}) {
  return (
    <section className="page-stack">
      <section className="surface detail-hero">
        <div>
          <p className="eyebrow">{visibilityLabel(space.visibility)}</p>
          <h3>{space.name}</h3>
          <p>{space.description || "暂无描述"}</p>
        </div>
        <div className="rag-settings">
          <span>TopK <strong>{space.topK}</strong></span>
          <span>阈值 <strong>{space.threshold.toFixed(2)}</strong></span>
          <span>温度 <strong>{space.temperature.toFixed(2)}</strong></span>
        </div>
      </section>

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

      {activeTab === "documents" ? (
        <DocumentsTab
          space={space}
          uploading={busyActions.has(`upload-${space.id}`)}
          refreshing={busyActions.has("refresh-space")}
          busyActions={busyActions}
          onUpload={onUpload}
          onCreateOnlineDocument={onCreateOnlineDocument}
          onViewDocument={onViewDocument}
          onEditOnlineDocument={onEditOnlineDocument}
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
          onSubmitQuestion={onSubmitQuestion}
          onSelectCitation={onSelectCitation}
          citation={citation}
        />
      ) : null}
      {activeTab === "members" ? (
        <MembersTab space={space} adding={busyActions.has("add-member")} busyActions={busyActions} onAddMember={onAddMember} onRemoveMember={onRemoveMember} />
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
    space.documents
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
  sessions: Array<{ id: number; title: string; updatedAt: string; spaceId: number; spaceName: string }>;
  onOpenSession: (spaceId: number, tab?: DetailTab, sessionId?: number) => void;
}) {
  return (
    <section className="surface">
      <div className="section-header compact">
        <h3>最近会话</h3>
      </div>
      <div className="simple-list">
        {sessions.map((session) => (
          <button className="list-row as-button" key={`${session.spaceId}-${session.id}`} type="button" onClick={() => onOpenSession(session.spaceId, "chat", session.id)}>
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
  onUpload,
  onCreateOnlineDocument,
  onViewDocument,
  onEditOnlineDocument,
  onDelete,
  onReindex,
  onRefresh
}: {
  space: KnowledgeSpace;
  uploading: boolean;
  refreshing: boolean;
  busyActions: Set<BusyAction>;
  onUpload: (file: File) => void;
  onCreateOnlineDocument: () => void;
  onViewDocument: (document: KnowledgeDocument) => void;
  onEditOnlineDocument: (document: KnowledgeDocument) => void;
  onDelete: (documentId: number) => void;
  onReindex: (documentId: number) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>文档</h3>
          <p>支持 PDF、TXT、Markdown。上传后会异步解析并写入文档分片；当前未启用 Milvus 时会跳过向量入库。</p>
        </div>
        <button className="secondary-btn" type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "刷新中" : "刷新状态"}
        </button>
      </div>
      <div className="document-create-row">
        <UploadZone onUpload={onUpload} uploading={uploading} />
        <button className="online-create-btn" type="button" onClick={onCreateOnlineDocument}>
          <strong>新建在线文档</strong>
          <span>直接编写文档内容，保存后自动入库。</span>
        </button>
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
            {space.documents.map((doc) => {
              const deleting = busyActions.has(`delete-document-${doc.id}`);
              const reindexing = busyActions.has(`reindex-document-${doc.id}`);
              const editing = busyActions.has(`edit-document-${doc.id}`);
              const viewing = busyActions.has(`view-document-${doc.id}`);
              const editable = doc.fileType === "MARKDOWN";
              return (
                <tr key={doc.id}>
                  <td>
                    <strong>{doc.fileName}</strong>
                    {doc.errorMessage ? <div className="inline-error">{doc.errorMessage}</div> : null}
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
                      {editable ? (
                        <button className="link-btn" type="button" onClick={() => onEditOnlineDocument(doc)} disabled={editing || reindexing || deleting}>
                          {editing ? "打开中" : "编辑"}
                        </button>
                      ) : null}
                      <button className="link-btn" type="button" onClick={() => onReindex(doc.id)} disabled={reindexing || deleting}>
                        {reindexing ? "重建中" : "重建"}
                      </button>
                      <button className="link-btn danger-link" type="button" onClick={() => onDelete(doc.id)} disabled={deleting || reindexing}>
                        {deleting ? "删除中" : "删除"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!space.documents.length ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="暂无文档" text="把制度、手册、方案或 FAQ 上传到这里，后续即可围绕资料提问。" compact />
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
      <span>支持 PDF、TXT、Markdown。上传后可在列表中刷新处理状态。</span>
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

function DocumentReadPage({
  page,
  onEdit,
  onBack
}: {
  page: Extract<DocumentPageState, { mode: "view" }>;
  onEdit: () => void;
  onBack: () => void;
}) {
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
          {page.editable ? (
            <button className="primary-btn" type="button" onClick={onEdit}>
              编辑文档
            </button>
          ) : null}
          <button className="secondary-btn" type="button" onClick={onBack}>
            返回列表
          </button>
        </div>
      </section>
      <section className={`surface document-render ${page.fileType.toLowerCase()}`}>
        {page.fileType === "MARKDOWN" ? <MarkdownRender content={page.content} /> : <pre>{page.content || "暂无可预览内容。"}</pre>}
      </section>
    </section>
  );
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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [toolbarState, setToolbarState] = useState<ToolbarState>({
    block: "p",
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bullet: false,
    number: false
  });
  const outlineItems = useMemo(() => extractOutline(page.content), [page.content]);

  function updateContent(content: string) {
    onChange({ ...page, content });
  }

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markdownToEditableHtml(page.content);
      document.execCommand("defaultParagraphSeparator", false, "p");
      updateToolbarState();
    }
  }, [page.mode, "documentId" in page ? page.documentId : "new"]);

  function syncEditorContent() {
    if (!editorRef.current) return;
    updateContent(editableHtmlToMarkdown(editorRef.current));
    updateToolbarState();
  }

  function runEditorCommand(callback: () => void) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    callback();
    window.requestAnimationFrame(() => {
      syncEditorContent();
      updateToolbarState();
    });
  }

  function applyBlock(block: EditorBlock) {
    runEditorCommand(() => document.execCommand("formatBlock", false, block));
  }

  function applyFont(font: EditorFont) {
    runEditorCommand(() => document.execCommand("fontName", false, editorFonts[font]));
  }

  function applySize(size: EditorSize) {
    runEditorCommand(() => document.execCommand("fontSize", false, editorSizes[size]));
  }

  function applyFormat(format: EditorFormat) {
    runEditorCommand(() => {
      if (format === "bold") document.execCommand("bold");
      if (format === "italic") document.execCommand("italic");
      if (format === "underline") document.execCommand("underline");
      if (format === "strike") document.execCommand("strikeThrough");
      if (format === "bullet") document.execCommand("insertUnorderedList");
      if (format === "number") document.execCommand("insertOrderedList");
      if (format === "quote") document.execCommand("formatBlock", false, "blockquote");
      if (format === "divider") document.execCommand("insertHorizontalRule");
      if (format === "color") document.execCommand("foreColor", false, "#d92d20");
      if (format === "highlight") document.execCommand("hiliteColor", false, "#fff1a8");
      if (format === "align-left") document.execCommand("justifyLeft");
      if (format === "align-center") document.execCommand("justifyCenter");
      if (format === "align-right") document.execCommand("justifyRight");
      if (format === "indent") document.execCommand("indent");
      if (format === "outdent") document.execCommand("outdent");
      if (format === "checklist") document.execCommand("insertHTML", false, "<p>☐ 待办事项</p>");
      if (format === "link") {
        const url = window.prompt("请输入链接地址");
        if (url?.trim()) document.execCommand("createLink", false, url.trim());
      }
      if (format === "clear") document.execCommand("removeFormat");
    });
  }

  function updateToolbarState() {
    const selection = window.getSelection();
    const block = selection?.anchorNode ? findActiveBlock(selection.anchorNode) : "p";
    setToolbarState({
      block,
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strike: document.queryCommandState("strikeThrough"),
      bullet: document.queryCommandState("insertUnorderedList"),
      number: document.queryCommandState("insertOrderedList")
    });
  }

  return (
    <form className="document-edit-shell" onSubmit={onSubmit}>
      <header className="document-edit-toolbar" aria-label="编辑工具栏">
        <div className="toolbar-group">
          <button className="toolbar-menu-button" type="button" title="菜单" onClick={onBack} disabled={saving}>
            <span className="menu-circle">☰</span>
            菜单
            <span className="toolbar-caret" />
          </button>
        </div>
        <div className="toolbar-group muted">
          <button className="toolbar-icon" type="button" title="撤销" onClick={() => runEditorCommand(() => document.execCommand("undo"))} disabled={saving}>↶</button>
          <button className="toolbar-icon" type="button" title="重做" onClick={() => runEditorCommand(() => document.execCommand("redo"))} disabled={saving}>↷</button>
          <button className="toolbar-icon" type="button" title="清除格式" onClick={() => applyFormat("clear")} disabled={saving}>⌫</button>
        </div>
        <div className="toolbar-group">
          <button
            className="toolbar-insert-button"
            type="button"
            title="插入"
            onClick={() => runEditorCommand(() => document.execCommand("insertHTML", false, "<p><br></p>"))}
            disabled={saving}
          >
            ⊕ 插入
            <span className="toolbar-caret" />
          </button>
        </div>
        <div className="toolbar-group">
          <select className="toolbar-select" value={toolbarState.block} onChange={(event) => applyBlock(event.target.value as EditorBlock)} disabled={saving} title="段落样式">
            <option value="p">正文</option>
            <option value="h1">标题</option>
            <option value="h2">标题2</option>
            <option value="h3">标题3</option>
          </select>
          <select className="toolbar-select font-select" defaultValue="雅黑" onChange={(event) => applyFont(event.target.value as EditorFont)} disabled={saving} title="字体">
            <option value="雅黑">雅黑</option>
            <option value="宋体">宋体</option>
            <option value="黑体">黑体</option>
            <option value="等宽">等宽</option>
          </select>
          <select className="toolbar-select size-select" defaultValue="正文" onChange={(event) => applySize(event.target.value as EditorSize)} disabled={saving} title="字号">
            <option value="小一">小一</option>
            <option value="正文">正文</option>
            <option value="大">大</option>
          </select>
        </div>
        <div className="toolbar-group">
          <button className="editor-command" type="button" title="增大字号" onClick={() => applySize("大")} disabled={saving}>A<sup>+</sup></button>
          <button className="editor-command" type="button" title="减小字号" onClick={() => applySize("小一")} disabled={saving}>A<sup>-</sup></button>
          {inlineCommands.map((command) => (
            <button
              className={`editor-command ${command.activeKey && toolbarState[command.activeKey] ? "active" : ""}`}
              type="button"
              key={command.format}
              onClick={() => applyFormat(command.format)}
              disabled={saving}
              title={command.title}
            >
              {command.label}
            </button>
          ))}
          <button className="editor-command with-caret" type="button" title="文字颜色" onClick={() => applyFormat("color")} disabled={saving}>
            <span className="color-command">A</span>
          </button>
          <button className="editor-command with-caret" type="button" title="高亮" onClick={() => applyFormat("highlight")} disabled={saving}>
            <span className="highlight-command">▰</span>
          </button>
          <button className="editor-command" type="button" title="更多" onClick={() => applyFormat("clear")} disabled={saving}>··· 更多</button>
        </div>
        <div className="toolbar-group">
          <button className="editor-command with-caret" type="button" title="左对齐" onClick={() => applyFormat("align-left")} disabled={saving}>☰</button>
        </div>
        <div className="toolbar-group">
          {structureCommands.map((command) => (
            <button
              className={`editor-command ${command.activeKey && toolbarState[command.activeKey] ? "active" : ""}`}
              type="button"
              key={command.format}
              onClick={() => applyFormat(command.format)}
              disabled={saving}
              title={command.title}
            >
              {command.label}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          {insertCommands.map((command) => (
            <button
              className="editor-command"
              type="button"
              key={command.format}
              onClick={() => applyFormat(command.format)}
              disabled={saving}
              title={command.title}
            >
              {command.label}
            </button>
          ))}
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button className="secondary-btn compact-btn" type="button" onClick={onBack} disabled={saving}>
            返回
          </button>
          <button className="primary-btn compact-btn" type="submit" disabled={saving || !page.title.trim() || !page.content.trim()}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </header>
      <section className="document-edit-stage">
        <main className="document-paper">
          <button className="document-icon-placeholder" type="button" disabled={saving}>
            添加图标
          </button>
          <input
            className="document-title-input"
            value={page.title}
            onChange={(event) => onChange({ ...page, title: event.target.value })}
            placeholder="未命名"
            disabled={saving}
          />
          <div
            ref={editorRef}
            className="editor-canvas markdown-render"
            contentEditable={!saving}
            suppressContentEditableWarning
            onInput={syncEditorContent}
            onBlur={syncEditorContent}
            onKeyUp={updateToolbarState}
            onMouseUp={updateToolbarState}
            data-placeholder="输入正文，或使用上方工具栏插入标题、列表、引用。"
          />
        </main>
        <aside className="document-outline" aria-label="文档大纲">
          <strong>大纲</strong>
          <div className="outline-list">
            {outlineItems.map((item, index) => (
              <span className={`outline-item level-${item.level}`} key={`${item.text}-${index}`}>
                {item.text}
              </span>
            ))}
            {!outlineItems.length ? <span className="outline-empty">暂无标题</span> : null}
          </div>
        </aside>
      </section>
    </form>
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
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function markdownToEditableHtml(content: string) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  if (!blocks.length) return "";
  return blocks.map(markdownBlockToHtml).join("");
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

function findActiveBlock(node: Node): EditorBlock {
  let current: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (current && current instanceof HTMLElement) {
    const tag = current.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
    if (tag === "p" || tag === "li" || tag === "blockquote" || tag === "pre" || tag === "div") return "p";
    current = current.parentNode;
  }
  return "p";
}

function markdownBlockToHtml(block: string) {
  if (block === "---") {
    return "<hr>";
  }
  if (block.startsWith("### ")) {
    return `<h3>${inlineMarkdownToHtml(block.slice(4))}</h3>`;
  }
  if (block.startsWith("## ")) {
    return `<h2>${inlineMarkdownToHtml(block.slice(3))}</h2>`;
  }
  if (block.startsWith("# ")) {
    return `<h1>${inlineMarkdownToHtml(block.slice(2))}</h1>`;
  }
  if (block.startsWith("> ")) {
    return `<blockquote>${inlineMarkdownToHtml(block.replace(/^>\s?/gm, ""))}</blockquote>`;
  }
  if (block.startsWith("```")) {
    return `<pre>${escapeHtml(block.replace(/^```[a-zA-Z0-9_-]*\n?/, "").replace(/```$/, ""))}</pre>`;
  }
  const lines = block.split("\n");
  if (lines.every((line) => /^[-*]\s+/.test(line.trim()))) {
    return `<ul>${lines.map((line) => `<li>${inlineMarkdownToHtml(line.trim().replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`;
  }
  if (lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
    return `<ol>${lines.map((line) => `<li>${inlineMarkdownToHtml(line.trim().replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
  }
  return `<p>${inlineMarkdownToHtml(lines.join("\n"))}</p>`;
}

function inlineMarkdownToHtml(text: string) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

function editableHtmlToMarkdown(root: HTMLElement) {
  return Array.from(root.childNodes)
    .map(nodeToMarkdown)
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function nodeToMarkdown(node: ChildNode): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.trim() || "";
  }
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  const tag = node.tagName.toLowerCase();
  if (tag === "h1") return `# ${inlineHtmlToMarkdown(node)}`;
  if (tag === "h2") return `## ${inlineHtmlToMarkdown(node)}`;
  if (tag === "h3") return `### ${inlineHtmlToMarkdown(node)}`;
  if (tag === "blockquote") return inlineHtmlToMarkdown(node).split("\n").map((line: string) => `> ${line}`).join("\n");
  if (tag === "pre") return `\`\`\`\n${node.textContent?.trim() || ""}\n\`\`\``;
  if (tag === "hr") return "---";
  if (tag === "ul") {
    return Array.from(node.children).map((child) => `- ${inlineHtmlToMarkdown(child as HTMLElement)}`).join("\n");
  }
  if (tag === "ol") {
    return Array.from(node.children).map((child, index) => `${index + 1}. ${inlineHtmlToMarkdown(child as HTMLElement)}`).join("\n");
  }
  if (tag === "div" && !node.textContent?.trim()) return "";
  return inlineHtmlToMarkdown(node);
}

function inlineHtmlToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map((node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (!(node instanceof HTMLElement)) return "";
      const tag = node.tagName.toLowerCase();
      if (tag === "strong" || tag === "b") return `**${node.textContent || ""}**`;
      if (tag === "br") return "\n";
      if (tag === "div") return `\n${inlineHtmlToMarkdown(node)}`;
      return inlineHtmlToMarkdown(node);
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ChatTab({
  space,
  activeSessionId,
  creatingSession,
  sending,
  onSelectSession,
  onCreateSession,
  onSubmitQuestion,
  onSelectCitation,
  citation
}: {
  space: KnowledgeSpace;
  activeSessionId: number | null;
  creatingSession: boolean;
  sending: boolean;
  onSelectSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onSubmitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onSelectCitation: (citation: Citation) => void;
  citation: Citation | null;
}) {
  const session = space.sessions.find((item) => item.id === activeSessionId) || space.sessions[0];
  return (
    <section className="chat-layout">
      <aside className="surface session-panel">
        <div className="section-header compact">
          <h3>会话</h3>
          <button className="icon-btn" title="新建会话" type="button" onClick={onCreateSession} disabled={creatingSession}>
            +
          </button>
        </div>
        <div className="session-list">
          {space.sessions.map((item) => (
            <button key={item.id} className={`session-item ${item.id === session?.id ? "active" : ""}`} type="button" onClick={() => onSelectSession(item.id)}>
              <strong>{item.title}</strong>
              <span>{item.updatedAt}</span>
            </button>
          ))}
          {!space.sessions.length ? <EmptyState title="暂无会话" text="新建会话后，可以围绕当前知识库资料提问。" compact /> : null}
        </div>
      </aside>

      <section className="surface chat-panel">
        <div className="message-list">
          {session?.messages.map((message, messageIndex) => (
            <article className={`message ${message.role}`} key={`${message.role}-${messageIndex}`}>
              <div>{message.content}</div>
              {message.role === "assistant" && !message.citations?.length ? (
                <p className="message-note">未返回引用来源。当前未启用向量检索或知识库中没有匹配片段时，可能出现这种情况。</p>
              ) : null}
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
            <h4>{citation.documentName}</h4>
            <div className="card-meta">
              <span className="pill">页码 {citation.pageNumber || "-"}</span>
              <span className="pill">分片 {citation.chunkIndex}</span>
              <span className="pill success">相似度 {citation.score.toFixed(6)}</span>
            </div>
            <div className="quote-box">{citation.quoteText}</div>
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
  adding,
  busyActions,
  onAddMember,
  onRemoveMember
}: {
  space: KnowledgeSpace;
  adding: boolean;
  busyActions: Set<BusyAction>;
  onAddMember: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveMember: (memberId: number) => void;
}) {
  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>成员权限</h3>
          <p>按知识库维度管理可访问成员。添加前请确认用户已存在。</p>
        </div>
      </div>
      <form className="member-form" onSubmit={onAddMember}>
        <label>
          用户 ID
          <input name="userId" type="number" min="1" placeholder="输入已存在用户 ID" />
        </label>
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
      <div className="member-grid">
        {space.members.map((member) => {
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
        {!space.members.length ? <EmptyState title="暂无成员" text="当前知识库还没有可展示的成员。" compact /> : null}
      </div>
    </section>
  );
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
          <label>
            TopK
            <input name="topK" type="number" min="1" max="20" defaultValue={space.topK} />
          </label>
          <label>
            相似度阈值
            <input name="threshold" type="number" min="0" max="1" step="0.01" defaultValue={space.threshold} />
          </label>
          <label>
            温度
            <input name="temperature" type="number" min="0" max="1" step="0.01" defaultValue={space.temperature} />
          </label>
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
        <p>当前部署默认关闭 Milvus。文档仍会完成上传、解析、切片和分片落库；问答在没有可用检索片段时会返回无匹配提示。</p>
        <p>后续独立 Milvus 服务就绪后，可通过配置开启向量写入和检索。</p>
      </section>
    </section>
  );
}

function RecentQuestions({
  sessions,
  onOpenSession
}: {
  sessions: Array<{ id: number; title: string; updatedAt: string; spaceId: number; spaceName: string }>;
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
          <button className="recent-item" key={`${session.spaceId}-${session.id}`} type="button" onClick={() => onOpenSession(session.spaceId, session.id)}>
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
