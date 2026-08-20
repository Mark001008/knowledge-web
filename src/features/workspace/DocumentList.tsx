import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { marked } from "marked";
import { MarkdownRenderer } from "../../components/ui/MarkdownRenderer";
import { statusClass, statusLabel } from "../../shared/status";
import type { DocumentStatus, KnowledgeDocument, KnowledgeSpace } from "../../shared/types/domain";
import type { BusyAction, DocumentPageState } from "./workspace-types";
import { EmptyState } from "./SpaceSidebar";

export function DocumentsTab({
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
      <IndexHealthPanel space={space} />
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
              <th>分片</th>
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
                  <td>{fileTypeLabel(doc.fileType)}</td>
                  <td>{doc.fileSize}</td>
                  <td>{doc.chunkCount}</td>
                  <td>{doc.uploadedBy}</td>
                  <td><span className={`pill ${statusClass(doc.status)}`}>{statusLabel(doc.status)}</span></td>
                  <td>{doc.updatedAt}</td>
                  <td>
                    <div className="row-actions">
                      {hasPermission("document:view") ? (
                        <button className="link-btn" type="button" disabled={viewing} onClick={() => onViewDocument(doc)}>
                          {viewing ? "加载中" : "查看"}
                        </button>
                      ) : null}
                      {hasPermission("document:update") && editable ? (
                        <button className="link-btn" type="button" disabled={editing} onClick={() => onEditOnlineDocument(doc)}>
                          {editing ? "加载中" : "编辑"}
                        </button>
                      ) : null}
                      {hasPermission("document:download") ? (
                        <button className="link-btn" type="button" disabled={downloading} onClick={() => onDownloadDocument(doc)}>
                          {downloading ? "下载中" : "下载"}
                        </button>
                      ) : null}
                      {hasPermission("document:reindex") ? (
                        <button className="link-btn" type="button" disabled={reindexing} onClick={() => onReindex(doc.id)}>
                          {reindexing ? "重建中" : "重建"}
                        </button>
                      ) : null}
                      {hasPermission("document:delete") ? (
                        <button className="link-btn danger-link" type="button" disabled={deleting} onClick={() => onDelete(doc.id)}>
                          {deleting ? "删除中" : "删除"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredDocs.length ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState title="暂无文档" text="上传文档后，会显示在这里。" compact />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IndexHealthPanel({ space }: { space: KnowledgeSpace }) {
  const fallback = buildIndexHealthFromDocuments(space);
  const health = space.indexHealth ?? fallback;
  const lastIndexedAt = health.lastIndexedAt || "-";
  return (
    <div className="index-health-grid">
      <SummaryCard label="已完成" value={health.completedDocuments} />
      <SummaryCard label="处理中" value={health.processingDocuments} tone={health.processingDocuments ? "warning" : "default"} />
      <SummaryCard label="失败" value={health.failedDocuments} tone={health.failedDocuments ? "warning" : "default"} />
      <SummaryCard label="分片" value={health.chunkCount} />
      <div className="index-health-note">
        <strong>{health.vectorEnabled ? "向量库可用" : "向量库未启用"}</strong>
        <span>最近索引：{lastIndexedAt}</span>
      </div>
    </div>
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

export function DocumentPage({
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
      </div>
      <div className="tiptap-editor">
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

function buildIndexHealthFromDocuments(space: KnowledgeSpace) {
  const documents = space.documents ?? [];
  return {
    totalDocuments: documents.length,
    completedDocuments: documents.filter((doc) => doc.status === "COMPLETED").length,
    processingDocuments: documents.filter((doc) => isProcessingStatus(doc.status)).length,
    failedDocuments: documents.filter((doc) => doc.status === "FAILED").length,
    chunkCount: documents.reduce((sum, doc) => sum + doc.chunkCount, 0),
    vectorEnabled: true,
    lastIndexedAt: documents.find((doc) => doc.status === "COMPLETED")?.updatedAt ?? null
  };
}

function isProcessingStatus(status: DocumentStatus) {
  return status === "PENDING" || status === "PARSING" || status === "INDEXING";
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
