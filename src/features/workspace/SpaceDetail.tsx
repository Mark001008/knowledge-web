import { type FormEvent, useState } from "react";
import type { ChatMessage, Citation, DetailTab, KnowledgeDocument, KnowledgeSpace } from "../../shared/types/domain";
import type { UserDTO } from "../../shared/types/system";
import type { BusyAction, AnswerMode } from "./workspace-types";
import { EmptyState } from "./SpaceSidebar";
import { DocumentsTab } from "./DocumentList";
import { ChatTab } from "./ChatPanel";

export function SpaceDetail({
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
  onDiagnoseQuestion,
  onFeedback,
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
  onDiagnoseQuestion: (spaceId: number, question: string) => Promise<ChatMessage>;
  onFeedback: (message: ChatMessage, rating: string, reason?: string) => void;
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
            diagnosing={busyActions.has("diagnose-question")}
            onSelectSession={onSelectSession}
            onCreateSession={onCreateSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
            onSubmitQuestion={onSubmitQuestion}
            onDiagnoseQuestion={onDiagnoseQuestion}
            onFeedback={onFeedback}
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
  return { topK: 5, threshold: 0.65, temperature: 0.2 };
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

export function SettingsTab({
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
