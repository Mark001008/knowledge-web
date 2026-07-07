import type { MenuDTO, RoleDTO } from "./system";

export type RouteKey = "spaces" | "recent" | "system";
export type DetailTab = "documents" | "chat" | "members" | "settings";
export type DocumentStatus = "PENDING" | "PARSING" | "INDEXING" | "COMPLETED" | "FAILED";

export interface UserInfo {
  id?: number;
  username?: string;
  displayName?: string;
  roles?: RoleDTO[];
}

export interface LoginResponse {
  accessToken: string;
  expiresIn?: number;
  user?: UserInfo;
  permissions?: string[];
  menus?: MenuDTO[];
}

export interface Citation {
  id: string;
  documentId: number;
  documentName: string;
  chunkId: number;
  pageNumber: number | null;
  chunkIndex: number | null;
  score: number;
  quoteText: string;
}

export interface IndexHealth {
  totalDocuments: number;
  completedDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  chunkCount: number;
  vectorEnabled: boolean;
  lastIndexedAt: string | null;
}

export interface RetrievalDiagnostics {
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
  indexHealth: IndexHealth | null;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  diagnostics?: RetrievalDiagnostics | null;
}

export interface ChatSession {
  id: number;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface KnowledgeDocument {
  id: number;
  fileName: string;
  fileType: string;
  fileSize: string;
  uploadedBy: string;
  status: DocumentStatus;
  updatedAt: string;
  errorMessage: string;
  chunkCount: number;
}

export interface Member {
  id: number;
  name: string;
  role: string;
  scope: string;
  status: "ACTIVE";
}

export interface KnowledgeSpace {
  id: number;
  name: string;
  description: string;
  visibility: "PRIVATE" | "INTERNAL";
  topK: number;
  threshold: number;
  temperature: number;
  updatedAt: string;
  members?: Member[];
  documents?: KnowledgeDocument[];
  sessions?: ChatSession[];
  documentCount?: number;
  sessionCount?: number;
  indexHealth?: IndexHealth | null;
  loaded?: boolean;
}
