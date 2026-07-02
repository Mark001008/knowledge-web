import type { DocumentStatus } from "./types/domain";

export function statusClass(status: DocumentStatus) {
  if (status === "COMPLETED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PARSING" || status === "INDEXING") return "info";
  return "warning";
}

export function statusLabel(status: DocumentStatus) {
  return {
    PENDING: "待处理",
    PARSING: "解析中",
    INDEXING: "索引中",
    COMPLETED: "已完成",
    FAILED: "失败"
  }[status];
}
