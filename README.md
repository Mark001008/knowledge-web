# AI 知识库前端项目

这是与 `knowledge-base` 后端同级的前端项目目录，用于前后端分离开发。

当前版本采用 `Vite + React + TypeScript`，覆盖：

- 登录
- 知识库列表
- 知识库详情
- 文档上传、状态、删除、重建
- 问答会话
- 引用来源查看
- 最近问答

## 启动

```bash
cd ~/workspace/my_project/ai-ma/knowledge-web
npm run dev
```

然后访问：

```text
http://localhost:5173
```

## 检查

```bash
npm run check
```

## 前端结构

```text
src/
├── main.tsx               # React 入口
├── app/
│   └── App.tsx            # 应用登录态和一级页面编排
├── config/
│   └── appConfig.ts       # 运行时配置，例如后端 API 地址
├── features/
│   ├── auth/              # 登录页和认证交互
│   └── workspace/         # 工作台、知识库、问答、运营视图
├── mock/
│   └── knowledgeData.ts   # 未接后端前的工作台示例数据
├── services/
│   ├── authApi.ts         # 认证接口请求
│   └── authSession.ts     # 登录态读写与清理
├── shared/
│   ├── status.ts          # 状态展示映射
│   └── types/             # 领域类型
└── styles.css             # 当前 UI 样式，后续可继续拆成模块样式
```

后续页面继续增长时，建议按业务域继续拆分：

- `features/auth/`：登录、退出、当前用户
- `features/spaces/`：知识库列表、详情、设置
- `features/documents/`：上传、解析状态、重建、删除
- `features/chat/`：会话、消息、引用来源
- `shared/`：通用请求、格式化、DOM 工具、基础 UI

## 后端接口对接边界

当前登录和工作台主体数据已经通过 `src/services/authApi.ts`、`src/services/workspaceApi.ts` 对接 `knowledge-base` 后端：

- `/api/auth/login`
- `/api/auth/me`
- `/api/spaces`
- `/api/spaces/{spaceId}/documents`
- `/api/spaces/{spaceId}/chat/sessions`
- `/api/chat/sessions/{sessionId}/messages`

`src/mock/knowledgeData.ts` 保留为样例数据参考，不再作为工作台默认数据源。
