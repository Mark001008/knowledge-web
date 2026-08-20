import type { DocumentStatus } from "../../shared/types/domain";

export type BusyAction =
  | "create-space"
  | "refresh-space"
  | "save-settings"
  | "delete-space"
  | "add-member"
  | "create-session"
  | "send-question"
  | "diagnose-question"
  | "create-online-document"
  | "save-online-document"
  | `upload-${number}`
  | `delete-document-${number}`
  | `download-document-${number}`
  | `edit-document-${number}`
  | `view-document-${number}`
  | `reindex-document-${number}`
  | `remove-member-${number}`;

export const busyText: Partial<Record<BusyAction, string>> = {
  "create-space": "创建中",
  "refresh-space": "刷新中",
  "save-settings": "保存中",
  "delete-space": "删除中",
  "add-member": "添加中",
  "create-session": "新建中",
  "send-question": "发送中",
  "diagnose-question": "诊断中",
  "create-online-document": "创建中",
  "save-online-document": "保存中"
};

export interface DocumentContentState {
  documentId: number;
  title: string;
  content: string;
  fileType: string;
  status: DocumentStatus;
  editable: boolean;
}

export type DocumentPageState =
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

export type AnswerMode = "strict" | "balanced" | "broad";
