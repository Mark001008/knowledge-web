import React, { type FormEvent, useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "../../components/ui/MarkdownRenderer";
import type { ChatMessage, Citation, DocumentStatus, KnowledgeDocument, KnowledgeSpace, RetrievalDiagnostics } from "../../shared/types/domain";
import { EmptyState } from "./SpaceSidebar";
import { SessionList } from "./SessionList";

export function ChatTab({
  space,
  activeSessionId,
  creatingSession,
  sending,
  diagnosing,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onDeleteSession,
  onSubmitQuestion,
  onDiagnoseQuestion,
  onFeedback,
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
  diagnosing: boolean;
  onSelectSession: (sessionId: number) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: number, newTitle: string) => void;
  onDeleteSession: (sessionId: number) => void;
  onSubmitQuestion: (event: FormEvent<HTMLFormElement>) => void;
  onDiagnoseQuestion: (spaceId: number, question: string) => Promise<ChatMessage>;
  onFeedback: (message: ChatMessage, rating: string, reason?: string) => void;
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
  const hasStreamingDraft = Boolean(session?.messages.some((message) => message.role === "assistant" && (message.id ?? 0) < 0));
  const [diagnosticQuery, setDiagnosticQuery] = useState("");
  const [diagnosticResult, setDiagnosticResult] = useState<ChatMessage | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const messageListRef = useRef<HTMLDivElement>(null);

  // 消息更新时自动滚动到底部
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [session?.messages]);

  async function handleDiagnose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = diagnosticQuery.trim();
    if (!question || diagnosing) return;
    const result = await onDiagnoseQuestion(space.id, question);
    setDiagnosticResult(result);
  }

  return (
    <section className="chat-layout">
      <SessionList
        sessions={space.sessions ?? []}
        activeSessionId={session?.id ?? null}
        canCreateSession={canCreateSession}
        canUpdateSession={canUpdateSession}
        canDeleteSession={canDeleteSession}
        creatingSession={creatingSession}
        onCreateSession={onCreateSession}
        onSelectSession={onSelectSession}
        onRenameSession={onRenameSession}
        onDeleteSession={onDeleteSession}
      />

      <section className="surface chat-panel">
        <form className={`diagnostic-panel ${diagnosticOpen ? "open" : "minimized"}`} onSubmit={handleDiagnose}>
          <div className="diagnostic-panel-head">
            <div>
              <strong>查询诊断</strong>
              <span>{diagnosticOpen ? "不写入会话，用于查看召回片段、分数、模式和是否进入 Prompt。" : diagnosticSummary(diagnosticResult)}</span>
            </div>
            <button
              className="link-btn"
              type="button"
              onClick={() => setDiagnosticOpen((open) => !open)}
              aria-expanded={diagnosticOpen}
            >
              {diagnosticOpen ? "收起" : "展开"}
            </button>
          </div>
          {diagnosticOpen ? (
            <>
              <div className="diagnostic-input-row">
                <input
                  value={diagnosticQuery}
                  onChange={(event) => setDiagnosticQuery(event.target.value)}
                  placeholder="输入问题进行 RAG 诊断"
                  disabled={diagnosing}
                />
                <button className="secondary-btn" type="submit" disabled={diagnosing || !diagnosticQuery.trim()}>
                  {diagnosing ? "诊断中" : "诊断"}
                </button>
              </div>
              {diagnosticResult?.diagnostics ? (
                <DiagnosticDetails diagnostics={diagnosticResult.diagnostics} />
              ) : null}
              {diagnosticResult?.citations?.length ? (
                <div className="diagnostic-citations">
                  {diagnosticResult.citations.map((item) => (
                    <button className="citation-chip" key={item.id} type="button" onClick={() => onSelectCitation(item)}>
                      {item.documentName} · {item.score.toFixed(3)}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </form>
        <div className="message-list" ref={messageListRef}>
          {session?.messages.map((message, messageIndex) => (
            <article className={`message ${message.role}`} key={`${message.role}-${messageIndex}`}>
              {message.role === "assistant" ? (
                message.content ? <MarkdownRenderer content={message.content} /> : <strong>正在生成回答</strong>
              ) : (
                <div>{message.content}</div>
              )}
              {message.role === "assistant" ? <RetrievalNote message={message} space={space} fallbackText={noCitationNote} /> : null}
              {message.role === "assistant" && message.diagnostics ? <DiagnosticDetails diagnostics={message.diagnostics} compact /> : null}
              {message.citations?.length ? (
                <div className="citation-list">
                  {message.citations.map((item) => (
                    <button className="citation-chip" key={item.id} type="button" onClick={() => onSelectCitation(item)}>
                      {item.documentName} · {item.score.toFixed(3)}
                    </button>
                  ))}
                </div>
              ) : null}
              {message.role === "assistant" ? (
                <div className="feedback-row">
                  <button className="link-btn" type="button" onClick={() => onFeedback(message, "HELPFUL")}>有用</button>
                  <button className="link-btn" type="button" onClick={() => onFeedback(message, "WRONG_ANSWER", "答非所问")}>答非所问</button>
                  <button className="link-btn" type="button" onClick={() => onFeedback(message, "BAD_SOURCE", "来源不对")}>来源不对</button>
                  <button className="link-btn" type="button" onClick={() => onFeedback(message, "OUTDATED", "信息过期")}>信息过期</button>
                </div>
              ) : null}
            </article>
          ))}
          {!session ? <EmptyState title="暂无会话" text="先新建一个会话，再询问当前知识库内容。" compact /> : null}
          {sending && !hasStreamingDraft ? (
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
              <span className="pill">分片 {citation.chunkIndex ?? citation.chunkId}</span>
              <span className="pill success">相似度 {citation.score.toFixed(6)}</span>
            </div>
            <p className="citation-locator">
              核验定位：优先查看原文第 {citation.pageNumber || "-"} 页；若原文页码不可用，可在解析文本中搜索下方引用片段或定位分片 {citation.chunkIndex ?? citation.chunkId}。
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

function RetrievalNote({
  message,
  space,
  fallbackText
}: {
  message: ChatMessage;
  space: KnowledgeSpace;
  fallbackText: string;
}) {
  const diagnostics = message.diagnostics;
  if (diagnostics) {
    const tone = diagnostics.lowConfidence || !diagnostics.hitCount ? "warning" : "info";
    return (
      <p className={`message-note ${tone}`}>
        {diagnostics.hitCount ? "检索说明" : "无答案原因"}：{diagnostics.explanation || fallbackText}
      </p>
    );
  }

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
      引用 {citations.length} 个片段，来自 {uniqueDocuments} 篇文档，最高相似度 {bestScore.toFixed(3)}。
    </p>
  );
}

function diagnosticSummary(result: ChatMessage | null) {
  const diagnostics = result?.diagnostics;
  if (!diagnostics) {
    return "默认收起；需要查看召回片段和分数时展开。";
  }
  return `上次诊断：${retrievalModeLabel(diagnostics.retrievalMode)}，命中 ${diagnostics.hitCount} 个片段，最高分 ${diagnostics.bestScore.toFixed(3)}。`;
}

function DiagnosticDetails({ diagnostics, compact = false }: { diagnostics: RetrievalDiagnostics; compact?: boolean }) {
  const health = diagnostics.indexHealth;
  return (
    <div className={`diagnostic-details ${compact ? "compact" : ""}`}>
      <span>模式：{retrievalModeLabel(diagnostics.retrievalMode)}</span>
      <span>命中：{diagnostics.hitCount}</span>
      <span>最高分：{diagnostics.bestScore.toFixed(3)}</span>
      <span>阈值：{diagnostics.threshold.toFixed(2)}</span>
      <span>topK：{diagnostics.topK}</span>
      <span>{diagnostics.enteredPrompt ? "已进入 Prompt" : "未进入 Prompt"}</span>
      {diagnostics.keywordFallbackUsed ? <span>关键词兜底</span> : null}
      {diagnostics.lowConfidence ? <span>低置信</span> : null}
      {health ? (
        <span>
          索引：完成 {health.completedDocuments} / 处理中 {health.processingDocuments} / 失败 {health.failedDocuments} / 分片 {health.chunkCount}
        </span>
      ) : null}
    </div>
  );
}

function retrievalModeLabel(mode: string) {
  return {
    HYBRID: "混合召回",
    VECTOR: "向量召回",
    KEYWORD: "关键词召回",
    VECTOR_EMPTY: "向量无命中",
    KEYWORD_EMPTY: "关键词无命中"
  }[mode] || mode || "-";
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

function isProcessingStatus(status: DocumentStatus) {
  return status === "PENDING" || status === "PARSING" || status === "INDEXING";
}
