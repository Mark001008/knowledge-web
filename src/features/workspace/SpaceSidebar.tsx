import { statusClass, statusLabel } from "../../shared/status";
import type { DetailTab, KnowledgeDocument, KnowledgeSpace } from "../../shared/types/domain";

export function WorkspaceHome({
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
            </div>
            <button className="primary-btn" type="button" onClick={onCreateSpace} disabled={creating}>
              {creating ? "创建中" : "新建知识库"}
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

export function EmptyState({
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

function visibilityLabel(visibility: KnowledgeSpace["visibility"]) {
  return visibility === "INTERNAL" ? "企业内部" : "私有";
}
