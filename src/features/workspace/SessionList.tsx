import { useState } from "react";
import type { ChatSession } from "../../shared/types/domain";
import { EmptyState } from "./SpaceSidebar";

export function SessionList({
  sessions,
  activeSessionId,
  canCreateSession,
  canUpdateSession,
  canDeleteSession,
  creatingSession,
  onCreateSession,
  onSelectSession,
  onRenameSession,
  onDeleteSession
}: {
  sessions: ChatSession[];
  activeSessionId: number | null;
  canCreateSession: boolean;
  canUpdateSession: boolean;
  canDeleteSession: boolean;
  creatingSession: boolean;
  onCreateSession: () => void;
  onSelectSession: (sessionId: number) => void;
  onRenameSession: (sessionId: number, newTitle: string) => void;
  onDeleteSession: (sessionId: number) => void;
}) {
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

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
        {sessions.map((item) => (
          <div key={item.id} className={`session-item-wrapper ${item.id === activeSessionId ? "active" : ""}`}>
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
        {!sessions.length ? <EmptyState title="暂无会话" text="新建会话后，可以围绕当前知识库资料提问。" compact /> : null}
      </div>
    </aside>
  );
}
