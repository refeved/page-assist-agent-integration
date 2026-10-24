# 共享 API 契约

简体中文 | [English](README.md)

本目录是 Page Assist HTTP API 和服务端推送事件（SSE）载荷的共享事实来源。契约应独立于任一产品实现。

实现跨仓库功能之前，新增或更新以下内容：

- OpenAPI 定义：HTTP 路径、认证要求、请求与响应体以及错误响应。
- SSE 事件载荷的 JSON Schema 和代表性测试样例。
- 必要时提供恢复、重复请求处理和终态的示例。

契约变更应描述可观察行为，包括授权、幂等性、重连和错误语义。应在工作区级测试中使用同一批样例校验两端实现。不要引入独立 Bridge 进程，也不要让任一产品仓库在运行时依赖本集成仓库。

## 第一版：基础频道 profile

当前选择独立安装的 `page_assist` 频道，而非完整浏览器应用网关。
允许频道在 **QwenPaw 同一进程中**增加专用 HTTP 监听（默认 `127.0.0.1:8766`）；
这是对原设计“复用同一端口”的明确阶段性调整，不增加独立服务进程。

协议 v1 载荷沿用 [前端协议说明](https://github.com/refeved/page-assist-agent-usage/blob/c7ea951a0e3ba4c67bfa7f21761f8fcd2134b6ad/docs/qwenpaw-remote.md)，
部署步骤见工作区中的 `qwenpaw-channel-page-assist/README.md`。
插件独立开发和版本管理，宿主使用 pip 安装的 QwenPaw，运行时不依赖宿主源码检出。

| 项目 | 第一版可观察行为 |
| --- | --- |
| 路径前缀 | `/api/page-assist` |
| 认证 | 每个请求使用频道专用 Bearer token，包括 SSE；无 Console 管理员凭据 |
| 身份 | 一个共享 token 代表一个用户，绑定一个 Agent；无逐工具 token scope |
| `GET /capabilities` | `protocolVersion=1`，三项 recovery/approvals/approvalEvents 均为 false |
| `GET /agents` | 只返回当前频道绑定的 Agent |
| `POST /conversations` | 服务端生成聊天 ID，不接受其他 Agent，返回 403 |
| `POST /conversations/:id/messages` | 只提交新问题及显式网页快照，返回 202 |
| 请求去重 | 同实例同 ID 同负载返回已有请求；跨聊天或负载冲突返回 409 |
| 并发 | 聊天占用时返回 409，不排队或合并 |
| 历史查询 | 当前频道实例内完整的浏览器展示历史，不是跨重启原生历史查询 |
| 请求查询 | 当前实例内请求状态；不构成跨断线恢复承诺 |
| `GET /requests/:id/events` | 状态 + 完整 assistant 快照 + 显式终态，无逐 token delta |
| 正常终态 | 消息快照之后发送 completed/failed/cancelled 终态；无恢复时前端也必须处理 |
| 不确定结果 | unknown 不解锁重发，未确认完成不能伪装成功 |
| 断线 | 不取消 Agent，不自动重发；前端锁定未完成请求，用户去 Console 核实 |
| 重启 | 新 instanceId 隔离旧缓存，新建聊天；不删除已有原生历史、记忆或副作用 |
| 审批 | 无浏览器决定 API，不自动批准；使用原生 Console |
| 容量 | 最多 100 个聊天、500 个请求，超出返回 429，不静默驱逐 |

延期：全局多 Agent 发现、持久账本、跨重启恢复、流式增量、审批卡片、富媒体、
浏览器远程取消。高级前端协议保留，受 capabilities 控制，不代表频道已经实现。
验收必须区分真实模型/工具与确定性执行替身。
