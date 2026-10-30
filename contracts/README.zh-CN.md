# 共享 API 契约

简体中文 | [English](README.md)

本目录是 Page Assist HTTP API 和服务端推送事件（SSE）载荷的共享事实来源。契约应独立于任一产品实现，也独立于具体 Agent 宿主；本文中的“宿主”指运行 Agent 的进程或服务。

实现跨仓库功能之前，新增或更新以下内容：

- OpenAPI 定义：HTTP 路径、认证要求、请求与响应体以及错误响应。
- SSE 事件载荷的 JSON Schema 和代表性测试样例。
- 必要时提供恢复、重复请求处理和终态的示例。

契约变更应描述可观察行为，包括授权、幂等性、重连和错误语义。应在工作区级测试中使用同一批样例校验两端实现。不要引入独立中继进程，也不要让任一产品仓库在运行时依赖本集成仓库。

## 第一版：基础频道 profile

当前选择独立安装的 `page_assist` 频道，而非完整浏览器应用网关。
第一版宿主为 QwenPaw：频道在 **QwenPaw 同一进程中**增加专用 HTTP 监听（默认 `127.0.0.1:8766`）；
这是对原设计“复用同一端口”的明确阶段性调整，不增加独立服务进程。
其他 OpenClaw 类 Agent 通过各自的宿主适配层接入同一契约，见“宿主无关性与后续适配”。
浏览器把该远程路径显示为 **Remote Agent**；QwenPaw 是首个后端实现，不是 Provider 名称。

协议 v1 载荷沿用 [Remote Agent 前端契约](https://github.com/refeved/page-assist-agent-usage/blob/feat/qwenpaw-remote-channel/docs/qwenpaw-remote.md)，
部署步骤见插件仓库的 [README](https://github.com/refeved/qwenpaw-channel-page-assist/blob/main/README.md)。
第一版插件独立开发和版本管理，宿主使用 pip 安装的 QwenPaw，运行时不依赖宿主源码检出；
后续适配层遵循相同边界。

| 项目 | 第一版可观察行为 |
| --- | --- |
| 路径前缀 | `/api/page-assist` |
| 认证 | 每个请求使用频道专用 Bearer token，包括 SSE；无宿主控制台管理员凭据 |
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
| 断线 | 不取消 Agent，不自动重发；前端锁定未完成请求，用户到宿主原生界面核实 |
| 重启 | 新 instanceId 隔离旧缓存，新建聊天；不删除已有原生历史、记忆或副作用 |
| 审批 | 无浏览器决定 API，不自动批准；使用宿主原生审批界面 |
| 容量 | 最多 100 个聊天、500 个请求，超出返回 429，不静默驱逐 |

延期：全局多 Agent 发现、持久账本、跨重启恢复、流式增量、审批卡片、富媒体、
浏览器远程取消、跨宿主统一网关与宿主间迁移。高级前端协议保留，受 capabilities
控制，不代表频道已经实现。验收必须区分真实模型/工具与确定性执行替身。

## 首版发布后扩展的能力

下表固定的是 v0.1.x 发布组合的基线。插件 `main` 与扩展开发分支在其上补充了三项
可选能力，前端按 capabilities 声明降级，协议前缀与认证边界不变：

- `approvals=true`：`GET /approvals` 返回本浏览器凭据拥有的待审批，
  `POST /approvals/:id/decision` 提交原生决定；同 `decisionId` 同负载幂等确认，
  冲突决定返回 409。`approvalEvents` 仍为 false，前端每 5 秒轮询对账。
- `attachments` 能力字段（v1 schema 的追加字段，缺省视为不支持）：
  `POST /attachments` base64 上传（受 `maxAttachmentBytes` 限制，服务端按魔数
  区分图片与文件并存入绑定 Agent 工作区），消息以 `attachmentId` 一次性引用至多
  `maxAttachments` 个；无正文、仅附件的消息合法。频道对请求体设 8 MiB 闸门，
  前置反代或中继必须放行相应的膨胀体积。`recovery` 仍为 false。
- `media=true`（v1 schema 的追加字段，缺省视为不支持该功能）：
  `send_content_parts` 不得把媒体压平成文本占位。宿主暂存打算让浏览器看到的字节，
  并在消息的 `attachments` 列表里引用：要么是受 Bearer 保护的 `GET /media/:id`
  提供的 `mediaId`，要么是原样转发的公共 http(s) `url`——在服务端抓取它会让宿主变成
  开放代理。暂存规模有界（单文件 5 MB、每条回复 4 个、每实例 64 MB，最旧优先驱逐，
  重启后全部失效），宿主文件系统路径不得传到浏览器。`protocolVersion` 仍为 1，
  `recovery` 仍为 false。

## 宿主无关性与后续适配

契约中的路径、认证、请求与响应体、SSE 语义均与宿主无关；`/api/page-assist`
是协议前缀，不绑定 QwenPaw 路由。第一版只交付 QwenPaw 适配层。计划支持其他
OpenClaw 类 Agent 时，新增适配层必须满足：

- 复用同一组端点、载荷字段和终态语义，不为单个宿主增加仅前端可见的分支。
- 通过 `GET /capabilities` 声明宿主能力（如 recovery、approvals、approvalEvents、
  流式增量）；超出 v1 schema 的能力需随协议版本扩展，前端按能力降级，不按宿主名称分支。
- 认证、身份绑定、审批和工具权限由宿主原生机制执行，适配层不得引入更宽松的旁路。
- 页面上下文仍是不可信参考数据，不能提升为系统指令或改变宿主策略。
- 宿主专属行为写入适配层文档，并在契约中标注为可选能力或延期项。
- 跨宿主共用同一批测试样例；新增宿主至少通过相同的 HTTP 与 SSE 契约测试。

每个适配层至少负责：监听地址与 token 校验、单 Agent 绑定、能力映射、错误码映射
（404/409/429），以及宿主原生审批入口。

未实现的宿主能力必须显式声明为 false 或省略；不得以模拟成功、自动批准或本地
降级代替。
