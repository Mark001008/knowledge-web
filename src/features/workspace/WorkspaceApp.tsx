import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  createChatSession,
  createKnowledgeSpace,
  deleteDocument,
  loadWorkspace,
  reindexDocument,
  sendChatMessage,
  uploadDocument
} from "../../services/workspaceApi";
import { statusClass, statusLabel } from "../../shared/status";
import type { AuditLog, Citation, DetailTab, KnowledgeDocument, KnowledgeSpace, RouteKey, UserInfo } from "../../shared/types/domain";

interface WorkspaceAppProps {
  token: string;
  user: UserInfo;
  onLogout: () => void;
}

const guardrails = [
  ["权限过滤", "向量检索必须带知识库和成员权限条件", "success"],
  ["引用溯源", "回答需要保留文档名、页码、分片和相似度", "success"],
  ["低置信兜底", "未达到阈值时明确提示知识库未收录", "warning"],
  ["敏感配置", "模型密钥通过环境变量注入", "info"]
];

export function WorkspaceApp({ token, user, onLogout }: WorkspaceAppProps) {
  const [route, setRoute] = useState<RouteKey>("spaces");
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("documents");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [keyword, setKeyword] = useState("");
  const [citation, setCitation] = useState<Citation | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const displayName = user.displayName || user.username || "管理员";
  const activeSpace = spaces.find((space) => space.id === activeSpaceId) || spaces[0] || null;
  const activeSession = activeSpace?.sessions.find((session) => session.id === activeSessionId) || activeSpace?.sessions[0] || null;
  const documents = spaces.flatMap((space) => space.documents);
  const filteredSpaces = spaces.filter((space) => {
    const text = `${space.name} ${space.description}`.toLowerCase();
    return !keyword.trim() || text.includes(keyword.trim().toLowerCase());
  });

  const metrics = useMemo(() => {
    const sessionCount = spaces.reduce((sum, space) => sum + space.sessions.length, 0);
    const hitRate = spaces.length ? Math.round(spaces.reduce((sum, space) => sum + space.hitRate, 0) / spaces.length) : 0;
    const latency = spaces.length ? spaces.reduce((sum, space) => sum + space.avgLatency, 0) / spaces.length : 0;
    return {
      spaceCount: spaces.length,
      documentCount: documents.length,
      processingCount: documents.filter((doc) => ["PENDING", "PARSING", "INDEXING"].includes(doc.status)).length,
      failedCount: documents.filter((doc) => doc.status === "FAILED").length,
      todayQuestions: sessionCount * 18 + 26,
      avgHitRate: `${hitRate}%`,
      avgLatency: `${latency.toFixed(1)}s`,
      lowConfidenceCount: 2
    };
  }, [documents, spaces]);

  useEffect(() => {
    refreshWorkspace();
  }, [token]);

  async function refreshWorkspace() {
    setLoading(true);
    setApiError("");
    try {
      const nextSpaces = await loadWorkspace(token);
      setSpaces(nextSpaces);
      if (!activeSpaceId && nextSpaces[0]) {
        setActiveSpaceId(null);
        setActiveSessionId(nextSpaces[0].sessions[0]?.id || null);
      }
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function openRoute(nextRoute: RouteKey) {
    setRoute(nextRoute);
    if (nextRoute !== "spaces") setActiveSpaceId(null);
  }

  function openSpace(spaceId: number, tab: DetailTab = "documents", sessionId?: number) {
    const nextSpace = spaces.find((space) => space.id === spaceId);
    setRoute("spaces");
    setActiveSpaceId(spaceId);
    setActiveTab(tab);
    setActiveSessionId(sessionId || nextSpace?.sessions[0]?.id || null);
  }

  function updateActiveSpace(updater: (space: KnowledgeSpace) => KnowledgeSpace) {
    if (!activeSpace) return;
    setSpaces((current) => current.map((space) => (space.id === activeSpace.id ? updater(space) : space)));
  }

  async function createSpace() {
    setApiError("");
    try {
      const nextSpace = await createKnowledgeSpace(token);
      setSpaces((current) => [nextSpace, ...current]);
      setAuditLogs((current) => [{ actor: displayName, action: "创建知识库", target: nextSpace.name, time: "刚刚" }, ...current]);
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    }
  }

  async function createSession() {
    if (!activeSpace) return null;
    setApiError("");
    try {
      const session = await createChatSession(token, activeSpace.id);
      updateActiveSpace((space) => ({ ...space, sessions: [session, ...space.sessions] }));
      setActiveSessionId(session.id);
      setAuditLogs((current) => [{ actor: displayName, action: "新建问答会话", target: activeSpace.name, time: "刚刚" }, ...current]);
      return session;
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
      return null;
    }
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = new FormData(form).get("question")?.toString().trim();
    if (!input || !activeSpace) return;
    form.reset();
    setApiError("");

    const session = activeSession || (await createSession());
    if (!session) return;

    updateActiveSpace((space) => ({
      ...space,
      sessions: space.sessions.map((item) =>
        item.id === session.id
          ? { ...item, messages: [...item.messages, { role: "user", content: input }], updatedAt: "刚刚" }
          : item
      )
    }));

    try {
      const answer = await sendChatMessage(token, session.id, input);
      updateActiveSpace((space) => ({
        ...space,
        sessions: space.sessions.map((item) =>
          item.id === session.id
            ? { ...item, messages: [...item.messages, answer], updatedAt: "刚刚" }
            : item
        )
      }));
      setAuditLogs((current) => [{ actor: displayName, action: `提问 ${input.slice(0, 18)}`, target: activeSpace.name, time: "刚刚" }, ...current]);
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    }
  }

  async function addDocument(file: File) {
    if (!activeSpace) return;
    setApiError("");
    try {
      const documents = await uploadDocument(token, activeSpace.id, file);
      updateActiveSpace((space) => ({ ...space, documents }));
      setAuditLogs((current) => [{ actor: displayName, action: `上传 ${file.name}`, target: activeSpace.name, time: "刚刚" }, ...current]);
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    }
  }

  async function handleDeleteDocument(documentId: number) {
    if (!activeSpace) return;
    setApiError("");
    try {
      await deleteDocument(token, documentId);
      updateActiveSpace((space) => ({ ...space, documents: space.documents.filter((doc) => doc.id !== documentId) }));
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    }
  }

  async function handleReindexDocument(documentId: number) {
    setApiError("");
    try {
      await reindexDocument(token, documentId);
      updateActiveSpace((space) => ({
        ...space,
        documents: space.documents.map((doc) => (doc.id === documentId ? { ...doc, status: "PENDING", errorMessage: "", updatedAt: "刚刚" } : doc))
      }));
    } catch (error) {
      setApiError(error instanceof TypeError ? "无法连接后端服务，请确认服务已启动" : (error as Error).message);
    }
  }

  const pageTitle = route === "recent" ? "最近问答" : route === "operations" ? "运营看板" : activeSpaceId && activeSpace ? activeSpace.name : "知识库";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="sidebar-brand">
          <span className="brand-mark">KB</span>
          <span>知识库工作台</span>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {[
            ["spaces", "▦", "知识库"],
            ["operations", "◎", "运营看板"],
            ["recent", "◷", "最近问答"]
          ].map(([key, icon, label]) => (
            <button key={key} className={`nav-item ${route === key ? "active" : ""}`} type="button" onClick={() => openRoute(key as RouteKey)}>
              <span className="icon">{icon}</span>
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

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">企业知识库</p>
            <h2>{pageTitle}</h2>
          </div>
          <div className="topbar-actions">
            {activeSpaceId ? (
              <button className="ghost-btn" type="button" onClick={() => setActiveSpaceId(null)}>
                返回知识库
              </button>
            ) : null}
          </div>
        </header>

        {apiError ? (
          <div className="form-error surface">{apiError}</div>
        ) : null}

        {loading ? (
          <section className="surface">
            <div className="citation-empty">正在加载知识库数据...</div>
          </section>
        ) : null}

        {!loading && route === "spaces" && !activeSpaceId ? (
          <section className="page-stack">
            <MetricGrid
              items={[
                ["可访问知识库", metrics.spaceCount],
                ["文档总数", metrics.documentCount],
                ["处理中", metrics.processingCount],
                ["失败任务", metrics.failedCount]
              ]}
            />
            <section className="surface command-center">
              <div>
                <p className="eyebrow">RAG Pipeline</p>
                <h3>企业知识运营中心</h3>
                <p>统一管理文档入库、权限范围、检索质量和引用可信度，适合产品、客服、研发和制度资料集中沉淀。</p>
              </div>
              <div className="pipeline">
                {["上传", "解析", "切片", "向量化", "问答", "溯源"].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </section>
            <section className="surface">
              <div className="section-header">
                <div>
                  <h3>知识库列表</h3>
                  <p>只展示当前用户有权限访问的知识库。</p>
                </div>
                <div className="inline-actions">
                  <input className="search-input" placeholder="搜索知识库" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                  <button className="primary-btn" type="button" onClick={createSpace}>
                    创建知识库
                  </button>
                </div>
              </div>
              <div className="space-grid">
                {filteredSpaces.map((space) => (
                  <article className="space-card" key={space.id}>
                    <h4>{space.name}</h4>
                    <p>{space.description}</p>
                    <div className="card-meta">
                      <span className="pill">{space.visibility}</span>
                      <span className="pill info">命中率 {space.hitRate}%</span>
                      <span className="pill success">{space.documents.filter((doc) => doc.status === "COMPLETED").length} 已完成</span>
                    </div>
                    <button className="secondary-btn full-width" type="button" onClick={() => openSpace(space.id)}>
                      进入知识库
                    </button>
                  </article>
                ))}
                {!filteredSpaces.length ? <div className="citation-empty">暂无知识库，点击右上角创建。</div> : null}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && route === "spaces" && activeSpaceId && activeSpace ? (
          <section className="page-stack">
            <section className="surface detail-hero">
              <div>
                <p className="eyebrow">{activeSpace.visibility}</p>
                <h3>{activeSpace.name}</h3>
                <p>{activeSpace.description}</p>
              </div>
              <div className="rag-settings">
                <span>TopK <strong>{activeSpace.topK}</strong></span>
                <span>阈值 <strong>{activeSpace.threshold.toFixed(2)}</strong></span>
                <span>温度 <strong>{activeSpace.temperature.toFixed(2)}</strong></span>
              </div>
            </section>
            <div className="tabs" role="tablist">
              {[
                ["documents", "文档"],
                ["chat", "问答"],
                ["members", "成员"],
                ["settings", "配置"]
              ].map(([key, label]) => (
                <button key={key} className={`tab ${activeTab === key ? "active" : ""}`} type="button" onClick={() => setActiveTab(key as DetailTab)}>
                  {label}
                </button>
              ))}
            </div>
            {activeTab === "documents" ? (
              <DocumentsTab
                space={activeSpace}
                onUpload={addDocument}
                onDelete={handleDeleteDocument}
                onReindex={handleReindexDocument}
              />
            ) : null}
            {activeTab === "chat" ? (
              <ChatTab
                space={activeSpace}
                activeSessionId={activeSession?.id || null}
                onSelectSession={setActiveSessionId}
                onCreateSession={createSession}
                onSubmitQuestion={sendQuestion}
                onSelectCitation={setCitation}
                citation={citation}
              />
            ) : null}
            {activeTab === "members" ? <MembersTab space={activeSpace} /> : null}
            {activeTab === "settings" ? <SettingsTab space={activeSpace} /> : null}
          </section>
        ) : null}

        {!loading && route === "operations" ? (
          <section className="page-stack">
            <MetricGrid
              items={[
                ["今日问答", metrics.todayQuestions],
                ["平均命中率", metrics.avgHitRate],
                ["平均耗时", metrics.avgLatency],
                ["低置信回答", metrics.lowConfidenceCount]
              ]}
            />
            <section className="ops-grid">
              <div className="surface">
                <div className="section-header compact">
                  <h3>处理队列</h3>
                </div>
                <div className="queue-list">
                  {spaces.flatMap((space) =>
                    space.documents
                      .filter((doc) => ["PENDING", "PARSING", "INDEXING", "FAILED"].includes(doc.status))
                      .map((doc) => (
                        <article className="queue-item" key={`${space.id}-${doc.id}`}>
                          <div>
                            <strong>{doc.fileName}</strong>
                            <span>{space.name} · {doc.updatedAt}</span>
                          </div>
                          <span className={`pill ${statusClass(doc.status)}`}>{statusLabel(doc.status)}</span>
                        </article>
                      ))
                  )}
                </div>
              </div>
              <div className="surface">
                <div className="section-header compact">
                  <h3>审计日志</h3>
                </div>
                <div className="audit-list">
                  {auditLogs.map((log, index) => (
                    <article className="audit-item" key={`${log.time}-${index}`}>
                      <strong>{log.actor}</strong>
                      <span>{log.action}</span>
                      <small>{log.target} · {log.time}</small>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </section>
        ) : null}

        {!loading && route === "recent" ? (
          <section className="page-stack">
            <section className="surface">
              <div className="section-header">
                <div>
                  <h3>最近问答</h3>
                  <p>快速回到最近的知识库会话。</p>
                </div>
              </div>
              <div className="recent-list">
                {spaces.flatMap((space) =>
                  space.sessions.map((session) => (
                    <button className="recent-item" key={`${space.id}-${session.id}`} type="button" onClick={() => openSpace(space.id, "chat", session.id)}>
                      <strong>{session.title}</strong>
                      <span>{space.name} · {session.updatedAt}</span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function MetricGrid({ items }: { items: Array<[string, string | number]> }) {
  return (
    <div className="metric-grid">
      {items.map(([label, value]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </div>
  );
}

function DocumentsTab({
  space,
  onUpload,
  onDelete,
  onReindex
}: {
  space: KnowledgeSpace;
  onUpload: (file: File) => void;
  onDelete: (documentId: number) => void;
  onReindex: (documentId: number) => void;
}) {
  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>文档</h3>
          <p>支持 PDF、TXT、Markdown，上传后异步解析和索引。</p>
        </div>
        <label className="upload-btn">
          上传文档
          <input type="file" accept=".pdf,.txt,.md,.markdown" hidden onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} />
        </label>
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
            {space.documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <strong>{doc.fileName}</strong>
                  {doc.errorMessage ? <div className="form-error">{doc.errorMessage}</div> : null}
                </td>
                <td>{doc.fileType}</td>
                <td>{doc.fileSize}</td>
                <td>{doc.uploadedBy}</td>
                <td><span className={`pill ${statusClass(doc.status)}`}>{statusLabel(doc.status)}</span></td>
                <td>{doc.updatedAt}</td>
                <td>
                  <div className="document-actions">
                    <button className="link-btn" type="button" onClick={() => onReindex(doc.id)}>重建</button>
                    <button className="link-btn" type="button" onClick={() => onDelete(doc.id)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
            {!space.documents.length ? (
              <tr>
                <td colSpan={7}>
                  <div className="citation-empty">暂无文档。</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChatTab({
  space,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onSubmitQuestion,
  onSelectCitation,
  citation
}: {
  space: KnowledgeSpace;
  activeSessionId: number | null;
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
          <button className="icon-btn" title="新建会话" type="button" onClick={onCreateSession}>＋</button>
        </div>
        <div className="session-list">
          {space.sessions.map((item) => (
            <button key={item.id} className={`session-item ${item.id === session?.id ? "active" : ""}`} type="button" onClick={() => onSelectSession(item.id)}>
              <strong>{item.title}</strong>
              <span>{item.updatedAt}</span>
            </button>
          ))}
          {!space.sessions.length ? <div className="citation-empty">暂无会话，点击上方按钮新建。</div> : null}
        </div>
      </aside>
      <section className="surface chat-panel">
        <div className="message-list">
          {session?.messages.map((message, messageIndex) => (
            <article className={`message ${message.role}`} key={`${message.role}-${messageIndex}`}>
              <div>{message.content}</div>
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
          {!session ? <div className="citation-empty">暂无会话。</div> : null}
        </div>
        <form className="chat-input-row" onSubmit={onSubmitQuestion}>
          <input name="question" placeholder="询问当前知识库内容" />
          <button className="primary-btn" type="submit">发送</button>
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
          <div className="citation-empty">点击答案引用查看原文片段。</div>
        )}
      </aside>
    </section>
  );
}

function MembersTab({ space }: { space: KnowledgeSpace }) {
  return (
    <section className="surface">
      <div className="section-header">
        <div>
          <h3>成员权限</h3>
          <p>按知识库维度管理负责人、可问答用户和只读成员。</p>
        </div>
        <button className="primary-btn" type="button">邀请成员</button>
      </div>
      <div className="member-grid">
        {space.members.map((member) => (
          <article className="member-card" key={member.id}>
            <div className="member-avatar">{member.name.slice(0, 1)}</div>
            <div>
              <strong>{member.name}</strong>
              <span>{member.role}</span>
            </div>
            <p>{member.scope}</p>
            <span className="pill success">已启用</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SettingsTab({ space }: { space: KnowledgeSpace }) {
  return (
    <section className="settings-layout">
      <section className="surface">
        <div className="section-header compact">
          <h3>检索策略</h3>
        </div>
        <div className="settings-form">
          <label>TopK<input type="number" min="1" max="20" defaultValue={space.topK} /></label>
          <label>相似度阈值<input type="number" min="0" max="1" step="0.01" defaultValue={space.threshold} /></label>
          <label>温度<input type="number" min="0" max="1" step="0.01" defaultValue={space.temperature} /></label>
          <button className="primary-btn" type="button">保存配置</button>
        </div>
      </section>
      <section className="surface">
        <div className="section-header compact">
          <h3>质量护栏</h3>
        </div>
        <div className="guardrail-list">
          {guardrails.map(([title, text, level]) => (
            <article className="guardrail-item" key={title}>
              <span className={`pill ${level}`}>{title}</span>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
