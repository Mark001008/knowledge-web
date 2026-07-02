import type { AuditLog, KnowledgeSpace } from "../shared/types/domain";

export const initialSpaces: KnowledgeSpace[] = [
  {
    id: 1001,
    name: "产品知识库",
    description: "产品资料、常见问题和使用手册。",
    visibility: "PRIVATE",
    topK: 5,
    threshold: 0.7,
    temperature: 0.2,
    updatedAt: "2026-07-02 10:28",
    hitRate: 92,
    avgLatency: 1.6,
    members: [
      { id: 1, name: "管理员", role: "知识库管理员", scope: "全部权限", status: "ACTIVE" },
      { id: 2, name: "产品运营", role: "普通用户", scope: "问答与引用查看", status: "ACTIVE" }
    ],
    documents: [
      { id: 2001, fileName: "产品手册.pdf", fileType: "PDF", fileSize: "4.8 MB", uploadedBy: "管理员", status: "COMPLETED", updatedAt: "2026-07-02 09:42", errorMessage: "" },
      { id: 2002, fileName: "SSO 接入说明.md", fileType: "Markdown", fileSize: "128 KB", uploadedBy: "管理员", status: "INDEXING", updatedAt: "2026-07-02 10:22", errorMessage: "" }
    ],
    sessions: [
      {
        id: 5001,
        title: "单点登录配置",
        updatedAt: "2026-07-02 10:30",
        messages: [
          { role: "user", content: "这个产品如何配置单点登录？" },
          {
            role: "assistant",
            content: "根据产品手册，管理员需要先在系统设置中启用 SSO，然后配置身份提供方元数据、回调地址和默认用户角色。配置完成后建议用测试账号验证登录链路。",
            citations: [
              {
                id: "c-1",
                documentId: 2001,
                documentName: "产品手册.pdf",
                chunkId: 3001,
                pageNumber: 5,
                chunkIndex: 12,
                score: 0.823412,
                quoteText: "管理员可在系统设置中启用 SSO，并填写身份提供方元数据、回调地址和默认用户角色。保存后应使用测试账号完成一次登录验证。"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 1002,
    name: "客服话术库",
    description: "常见咨询、售后流程和问题排查指引。",
    visibility: "INTERNAL",
    topK: 6,
    threshold: 0.72,
    temperature: 0.15,
    updatedAt: "2026-07-01 17:06",
    hitRate: 81,
    avgLatency: 2.1,
    members: [
      { id: 3, name: "客服主管", role: "知识库管理员", scope: "文档与问答管理", status: "ACTIVE" },
      { id: 4, name: "一线客服", role: "普通用户", scope: "问答", status: "ACTIVE" },
      { id: 5, name: "质检专员", role: "只读用户", scope: "引用查看", status: "ACTIVE" }
    ],
    documents: [
      { id: 2003, fileName: "售后 FAQ.txt", fileType: "TXT", fileSize: "96 KB", uploadedBy: "管理员", status: "COMPLETED", updatedAt: "2026-07-01 16:55", errorMessage: "" },
      { id: 2004, fileName: "退换货规则.pdf", fileType: "PDF", fileSize: "2.1 MB", uploadedBy: "管理员", status: "FAILED", updatedAt: "2026-07-01 17:01", errorMessage: "PDF 文本提取失败，请检查文件是否为扫描件。" }
    ],
    sessions: [
      {
        id: 5002,
        title: "退换货处理",
        updatedAt: "2026-07-01 17:08",
        messages: [
          { role: "user", content: "超过 7 天还能退货吗？" },
          { role: "assistant", content: "当前知识库中未找到相关信息。", citations: [] }
        ]
      }
    ]
  },
  {
    id: 1003,
    name: "研发规范库",
    description: "后端分层、代码规范、上线检查和排障文档。",
    visibility: "PRIVATE",
    topK: 5,
    threshold: 0.68,
    temperature: 0.2,
    updatedAt: "2026-06-30 14:12",
    hitRate: 88,
    avgLatency: 1.9,
    members: [
      { id: 6, name: "研发负责人", role: "知识库管理员", scope: "全部权限", status: "ACTIVE" },
      { id: 7, name: "后端工程师", role: "普通用户", scope: "问答与引用查看", status: "ACTIVE" }
    ],
    documents: [
      { id: 2005, fileName: "后端开发规范.md", fileType: "Markdown", fileSize: "220 KB", uploadedBy: "管理员", status: "PARSING", updatedAt: "2026-07-02 10:16", errorMessage: "" }
    ],
    sessions: []
  }
];

export const initialAuditLogs: AuditLog[] = [
  { actor: "管理员", action: "上传 产品手册.pdf", target: "产品知识库", time: "2026-07-02 09:42" },
  { actor: "客服主管", action: "重建 退换货规则.pdf", target: "客服话术库", time: "2026-07-01 17:01" },
  { actor: "研发负责人", action: "创建 研发规范库", target: "研发规范库", time: "2026-06-30 14:12" }
];
