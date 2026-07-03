import { appConfig } from "../config/appConfig";
import type {
  ChatMessage,
  ChatSession,
  Citation,
  DocumentStatus,
  KnowledgeDocument,
  KnowledgeSpace,
  Member
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
  score: number;
  quoteText: string;
}

interface ChatMessageVO {
  id: number;
  role: "user" | "assistant";
  content: string;
  modelName: string | null;
  citations: CitationDTO[] | null;
  createdAt: string;
}

interface ChatMessageResponse {
  messageId: number;
  answer: string;
  citations: CitationDTO[];
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
    throw new Error(payload?.message || `请求失败，服务返回 ${response.status}`);
  }
  if (!payload || payload.code !== 0) {
    throw new Error(payload?.message || "请求失败，请稍后重试");
  }
  return payload.data;
}

export async function loadWorkspace(token: string): Promise<KnowledgeSpace[]> {
  const spaces = await request<SpaceVO[]>(token, "/api/spaces");
  return Promise.all(spaces.map((space) => hydrateSpace(token, space)));
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

export async function uploadDocument(token: string, spaceId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  await request(token, `/api/spaces/${spaceId}/documents`, {
    method: "POST",
    body: formData
  });
  return listDocuments(token, spaceId);
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
    role: "assistant" as const,
    content: response.answer,
    citations: response.citations.map(toCitation)
  };
}

export async function listMessages(token: string, sessionId: number) {
  const messages = await request<ChatMessageVO[]>(token, `/api/chat/sessions/${sessionId}/messages`);
  return messages.map(toChatMessage);
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
    hitRate: 0,
    avgLatency: 0,
    members,
    documents,
    sessions
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
    errorMessage: document.errorMessage || ""
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
    citations: message.citations?.map(toCitation) || []
  };
}

function toCitation(citation: CitationDTO): Citation {
  return {
    id: `${citation.documentId}-${citation.chunkId}`,
    documentId: citation.documentId,
    documentName: citation.documentName || `文档 ${citation.documentId}`,
    chunkId: citation.chunkId,
    pageNumber: citation.pageNumber,
    chunkIndex: citation.chunkId,
    score: Number(citation.score),
    quoteText: citation.quoteText
  };
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
