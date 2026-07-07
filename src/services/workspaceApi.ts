import { appConfig } from "../config/appConfig";
import { requireFreshLogin } from "./authSession";
import type {
  ChatMessage,
  ChatSession,
  Citation,
  DocumentStatus,
  IndexHealth,
  KnowledgeDocument,
  KnowledgeSpace,
  Member,
  RetrievalDiagnostics
} from "../shared/types/domain";

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface SpaceVO {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  ownerName: string | null;
  visibility: "PRIVATE" | "INTERNAL";
  topK: number;
  similarityThreshold: number;
  temperature: number;
  chunkSize: number;
  chunkOverlap: number;
  documentCount: number | null;
  indexHealth: IndexHealthDTO | null;
  createdAt: string;
  updatedAt: string;
}

interface DocumentVO {
  id: number;
  spaceId: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  parseStatus: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number | null;
  uploadedBy: number;
  uploadedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SpaceMemberVO {
  userId: number;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
}

interface ChatSessionVO {
  id: number;
  spaceId: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface CitationDTO {
  documentId: number;
  documentName: string | null;
  chunkId: number;
  pageNumber: number | null;
  chunkIndex: number | null;
  score: number;
  quoteText: string;
}

interface IndexHealthDTO {
  totalDocuments: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  chunkCount: number;
  vectorEnabled: boolean;
  lastIndexedAt: string | null;
}

interface RetrievalDiagnosticsDTO {
  hitCount: number;
  bestScore: number;
  threshold: number;
  topK: number;
  retrievalMode: string;
  keywordFallbackUsed: boolean;
  enteredPrompt: boolean;
  lowConfidence: boolean;
  noAnswerReason: string;
  explanation: string;
  indexHealth: IndexHealthDTO | null;
}

interface ChatMessageVO {
  id: number;
  role: "user" | "assistant";
  content: string;
  modelName: string | null;
  citations: CitationDTO[] | null;
  diagnostics: RetrievalDiagnosticsDTO | null;
  createdAt: string;
}

interface ChatMessageResponse {
  messageId: number | null;
  answer: string;
  citations: CitationDTO[];
  diagnostics: RetrievalDiagnosticsDTO | null;
}

async function request<T>(token: string, path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...options,
    headers
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok) {
    if (response.status === 401) {
      requireFreshLogin();
      throw new Error("登录状态已过期，请重新登录");
    }
    if (response.status === 403) {
      throw new Error(payload?.message || "您没有执行此操作的权限");
    }
    throw new Error(payload?.message || `请求失败，服务返回 ${response.status}`);
  }
  if (!payload || payload.code !== 0) {
    throw new Error(payload?.message || "请求失败，请稍后重试");
  }
  return payload.data;
}

export async function loadWorkspace(token: string): Promise<KnowledgeSpace[]> {
  const spaces = await request<SpaceVO[]>(token, "/api/spaces");
  return spaces.map(toSpaceSummary);
}

export async function loadSpaceDetail(token: string, spaceId: number): Promise<KnowledgeSpace> {
  const space = await request<SpaceVO>(token, `/api/spaces/${spaceId}`);
  return hydrateSpace(token, space);
}

export async function loadKnowledgeSpace(token: string, spaceId: number) {
  const space = await request<SpaceVO>(token, `/api/spaces/${spaceId}`);
  return hydrateSpace(token, space);
}

export async function createKnowledgeSpace(token: string) {
  const timestamp = Date.now().toString().slice(-4);
  const space = await request<SpaceVO>(token, "/api/spaces", {
    method: "POST",
    body: JSON.stringify({
      name: `新知识库 ${timestamp}`,
      description: "用于整理新上传的业务资料。",
      visibility: "PRIVATE",
      topK: 5,
      similarityThreshold: 0.7,
      temperature: 0.2
    })
  });
  return hydrateSpace(token, space);
}

export async function updateKnowledgeSpace(
  token: string,
  spaceId: number,
  payload: {
    name?: string;
    description?: string;
    visibility?: "PRIVATE" | "INTERNAL";
    topK?: number;
    similarityThreshold?: number;
    temperature?: number;
  }
) {
  const space = await request<SpaceVO>(token, `/api/spaces/${spaceId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  return hydrateSpace(token, space);
}

export async function deleteKnowledgeSpace(token: string, spaceId: number) {
  await request<void>(token, `/api/spaces/${spaceId}`, {
    method: "DELETE"
  });
}

export async function addSpaceMember(token: string, spaceId: number, userId: number, role: string) {
  await request<void>(token, `/api/spaces/${spaceId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, role })
  });
  return loadKnowledgeSpace(token, spaceId);
}

export async function removeSpaceMember(token: string, spaceId: number, memberId: number) {
  await request<void>(token, `/api/spaces/${spaceId}/members/${memberId}`, {
    method: "DELETE"
  });
  return loadKnowledgeSpace(token, spaceId);
}

export async function uploadDocument(token: string, spaceId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  await request(token, `/api/spaces/${spaceId}/documents`, {
    method: "POST",
    body: formData
  });
  return listDocuments(token, spaceId);
}

export async function createOnlineDocument(token: string, spaceId: number, title: string, content: string) {
  await request(token, `/api/spaces/${spaceId}/documents/online`, {
    method: "POST",
    body: JSON.stringify({ title, content })
  });
  return listDocuments(token, spaceId);
}

export async function getDocumentContent(token: string, documentId: number) {
  return request<{ documentId: number; title: string; content: string; fileType: string; status: DocumentStatus }>(token, `/api/documents/${documentId}/content`);
}

export async function updateDocumentContent(token: string, documentId: number, title: string, content: string) {
  await request(token, `/api/documents/${documentId}/content`, {
    method: "PUT",
    body: JSON.stringify({ title, content })
  });
}

export async function deleteDocument(token: string, documentId: number) {
  await request<void>(token, `/api/documents/${documentId}`, {
    method: "DELETE"
  });
}

export async function reindexDocument(token: string, documentId: number) {
  await request<void>(token, `/api/documents/${documentId}/reindex`, {
    method: "POST"
  });
}

export async function downloadOriginalDocument(token: string, documentId: number, fallbackFileName: string) {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/documents/${documentId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    if (response.status === 401) {
      requireFreshLogin();
      throw new Error("登录状态已过期，请重新登录");
    }
    if (response.status === 403) {
      throw new Error("您没有下载此文档的权限");
    }
    throw new Error(`下载失败，服务返回 ${response.status}`);
  }

  const blob = await response.blob();
  const fileName = getDownloadFileName(response.headers.get("Content-Disposition")) || fallbackFileName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function createChatSession(token: string, spaceId: number, title = "新会话") {
  const session = await request<ChatSessionVO>(token, `/api/spaces/${spaceId}/chat/sessions`, {
    method: "POST",
    body: JSON.stringify({ title })
  });
  return toChatSession(session, []);
}

export async function sendChatMessage(token: string, sessionId: number, question: string) {
  const response = await request<ChatMessageResponse>(token, `/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ question })
  });
  return {
    id: response.messageId ?? undefined,
    role: "assistant" as const,
    content: response.answer,
    citations: response.citations.map(toCitation),
    diagnostics: toDiagnostics(response.diagnostics)
  };
}

export async function streamChatMessage(
  token: string,
  sessionId: number,
  question: string,
  callbacks: {
    onStatus?: (message: string) => void;
    onDelta?: (delta: string) => void;
  } = {}
) {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "text/event-stream");

  const response = await fetch(`${appConfig.apiBaseUrl}/api/chat/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ question })
  });

  if (!response.ok) {
    if (response.status === 401) {
      requireFreshLogin();
      throw new Error("登录状态已过期，请重新登录");
    }
    if (response.status === 403) {
      throw new Error("您没有发起问答的权限");
    }
    throw new Error(`流式问答失败，服务返回 ${response.status}`);
  }
  if (!response.body) {
    throw new Error("当前浏览器不支持流式读取");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: ChatMessage | null = null;
  let streamError = "";

  function handleBlock(block: string) {
    const lines = block.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() || "";
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (!data) return;
    const payload = JSON.parse(data) as { type: string; content: string; message: ChatMessageResponse | null };
    const type = payload.type || event;
    if (type === "status") {
      callbacks.onStatus?.(payload.content);
      return;
    }
    if (type === "delta") {
      callbacks.onDelta?.(payload.content);
      return;
    }
    if (type === "complete" && payload.message) {
      finalMessage = {
        id: payload.message.messageId ?? undefined,
        role: "assistant",
        content: payload.message.answer,
        citations: payload.message.citations.map(toCitation),
        diagnostics: toDiagnostics(payload.message.diagnostics)
      };
      return;
    }
    if (type === "error") {
      streamError = payload.content || "流式问答失败";
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(handleBlock);
    if (done) break;
  }
  if (buffer.trim()) {
    handleBlock(buffer);
  }
  if (streamError) {
    throw new Error(streamError);
  }
  if (!finalMessage) {
    throw new Error("流式问答未返回完成事件");
  }
  return finalMessage;
}

export async function diagnoseChatQuery(token: string, spaceId: number, question: string) {
  const response = await request<ChatMessageResponse>(token, `/api/spaces/${spaceId}/chat/diagnose`, {
    method: "POST",
    body: JSON.stringify({ question })
  });
  return {
    id: response.messageId ?? undefined,
    role: "assistant" as const,
    content: response.answer,
    citations: response.citations.map(toCitation),
    diagnostics: toDiagnostics(response.diagnostics)
  };
}

export async function submitChatFeedback(token: string, messageId: number | undefined, rating: string, reason: string) {
  await request<void>(token, "/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify({ messageId, rating, reason })
  });
}

export async function listMessages(token: string, sessionId: number) {
  const messages = await request<ChatMessageVO[]>(token, `/api/chat/sessions/${sessionId}/messages`);
  return messages.map(toChatMessage);
}

export async function updateChatSession(token: string, sessionId: number, title: string) {
  await request<void>(token, `/api/chat/sessions/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify({ title })
  });
}

export async function deleteChatSession(token: string, sessionId: number) {
  await request<void>(token, `/api/chat/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export async function listRecentSessions(token: string, limit = 20) {
  return request<Array<{ sessionId: number; spaceId: number; spaceName: string; title: string; updatedAt: string }>>(
    token,
    `/api/chat/recent-sessions?limit=${limit}`
  );
}

async function hydrateSpace(token: string, space: SpaceVO): Promise<KnowledgeSpace> {
  const [documents, members, sessionVOs] = await Promise.all([
    listDocuments(token, space.id),
    listMembers(token, space.id),
    request<ChatSessionVO[]>(token, `/api/spaces/${space.id}/chat/sessions`)
  ]);
  const sessions = await Promise.all(
    sessionVOs.map(async (session) => toChatSession(session, await listMessages(token, session.id)))
  );
  return toKnowledgeSpace(space, documents, members, sessions);
}

async function listDocuments(token: string, spaceId: number) {
  const documents = await request<DocumentVO[]>(token, `/api/spaces/${spaceId}/documents`);
  return documents.map(toDocument);
}

async function listMembers(token: string, spaceId: number) {
  const members = await request<SpaceMemberVO[]>(token, `/api/spaces/${spaceId}/members`);
  return members.map(toMember);
}

function toSpaceSummary(space: SpaceVO): KnowledgeSpace {
  return {
    id: space.id,
    name: space.name,
    description: space.description || "",
    visibility: space.visibility,
    topK: space.topK,
    threshold: Number(space.similarityThreshold ?? 0.7),
    temperature: Number(space.temperature ?? 0.2),
    updatedAt: formatTime(space.updatedAt),
    documentCount: space.documentCount ?? 0,
    indexHealth: toIndexHealth(space.indexHealth),
    loaded: false
  };
}

function toKnowledgeSpace(space: SpaceVO, documents: KnowledgeDocument[], members: Member[], sessions: ChatSession[]): KnowledgeSpace {
  return {
    id: space.id,
    name: space.name,
    description: space.description || "",
    visibility: space.visibility,
    topK: space.topK,
    threshold: Number(space.similarityThreshold ?? 0.7),
    temperature: Number(space.temperature ?? 0.2),
    updatedAt: formatTime(space.updatedAt),
    members,
    documents,
    sessions,
    documentCount: documents.length,
    sessionCount: sessions.length,
    indexHealth: toIndexHealth(space.indexHealth),
    loaded: true
  };
}

function toDocument(document: DocumentVO): KnowledgeDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: formatFileSize(document.fileSize),
    uploadedBy: document.uploadedByName || `用户 ${document.uploadedBy}`,
    status: document.parseStatus,
    updatedAt: formatTime(document.updatedAt),
    errorMessage: document.errorMessage || "",
    chunkCount: document.chunkCount ?? 0
  };
}

function toMember(member: SpaceMemberVO): Member {
  return {
    id: member.userId,
    name: member.displayName || member.username,
    role: roleLabel(member.role),
    scope: member.role,
    status: "ACTIVE"
  };
}

function toChatSession(session: ChatSessionVO, messages: ChatMessage[]): ChatSession {
  return {
    id: session.id,
    title: session.title,
    updatedAt: formatTime(session.updatedAt),
    messages
  };
}

function toChatMessage(message: ChatMessageVO): ChatMessage {
  return {
    role: message.role,
    content: message.content,
    id: message.id,
    citations: message.citations?.map(toCitation) || [],
    diagnostics: toDiagnostics(message.diagnostics)
  };
}

function toCitation(citation: CitationDTO): Citation {
  return {
    id: `${citation.documentId}-${citation.chunkId}`,
    documentId: citation.documentId,
    documentName: citation.documentName || `文档 ${citation.documentId}`,
    chunkId: citation.chunkId,
    pageNumber: citation.pageNumber,
    chunkIndex: citation.chunkIndex ?? null,
    score: Number(citation.score),
    quoteText: citation.quoteText
  };
}

function toIndexHealth(health: IndexHealthDTO | null | undefined): IndexHealth | null {
  if (!health) return null;
  return {
    totalDocuments: health.totalDocuments,
    completedDocuments: health.completedDocuments,
    processingDocuments: health.processingDocuments,
    failedDocuments: health.failedDocuments,
    chunkCount: health.chunkCount,
    vectorEnabled: health.vectorEnabled,
    lastIndexedAt: health.lastIndexedAt ? formatTime(health.lastIndexedAt) : null
  };
}

function toDiagnostics(diagnostics: RetrievalDiagnosticsDTO | null | undefined): RetrievalDiagnostics | null {
  if (!diagnostics) return null;
  return {
    hitCount: diagnostics.hitCount,
    bestScore: Number(diagnostics.bestScore),
    threshold: Number(diagnostics.threshold),
    topK: diagnostics.topK,
    retrievalMode: diagnostics.retrievalMode,
    keywordFallbackUsed: diagnostics.keywordFallbackUsed,
    enteredPrompt: diagnostics.enteredPrompt,
    lowConfidence: diagnostics.lowConfidence,
    noAnswerReason: diagnostics.noAnswerReason || "",
    explanation: diagnostics.explanation || "",
    indexHealth: toIndexHealth(diagnostics.indexHealth)
  };
}

function getDownloadFileName(contentDisposition: string | null) {
  if (!contentDisposition) return "";
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return asciiMatch?.[1] || "";
}

function roleLabel(role: string) {
  return {
    OWNER: "所有者",
    ADMIN: "知识库管理员",
    READER: "只读用户"
  }[role] || role;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 16);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
