# Page Assist 接入远程 QwenPaw Agent 设计方案

[简体中文](design.zh-CN.md) | [English](design.md)

> 实施说明（2026-10-24）：本文保留更广泛的设计方案。已实现的第一版使用独立版本管理的
> [`qwenpaw-channel-page-assist`](https://github.com/refeved/qwenpaw-channel-page-assist)
> 频道仓库和 pip 发布版 QwenPaw，而非 PawApp 或宿主核心修改。
> 部署、仓库职责和实际支持能力以[基础频道 profile](../contracts/README.zh-CN.md#第一版基础频道-profile)
> 及[当前架构](architecture.zh-CN.md)为准。
>
> v0.1.0（2026-10-25）：QwenPaw 使用 `v2.2.2.post1`，Page Assist 与插件使用
> `remote-agent-preview-1`。这是首个可运行预览，不代表完整设计已通过运行验收。
>
> 界面中的 Provider 名称为 **Remote Agent**，QwenPaw 是首个后端实现；下文历史性的
> “QwenPaw 模式”均指该 Provider。预览复用原生 header／composer 布局，并由
> `provider-capabilities.ts` 统一判定能力，不挂载本地消息控制器。

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v2.2 |
| 日期 | 2026-10-23 |
| 状态 | 设计方案；v0.1.0 预览已实施，完整设计仍待运行验收 |
| 目标平台 | Google Chrome，Manifest V3 |
| 前端基础 | Page Assist 轻量 Fork |
| 前端开发基线 | 上游正式 Release `v1.5.88`，2026-10-18；提交 `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`；集成 tag `remote-agent-preview-1`，提交 `c9eddc0d236bc58944bb0613ec317dd12d548bf1` |
| 服务端基础 | QwenPaw 稳定版原生 Agent、PawApp 与 PluginApi |
| 部署方式 | 接入模块运行于 QwenPaw 进程内，不独立部署 Bridge |
| 核心能力 | 网页上下文分享、Agent 选择、结合记忆对话、原生工具审批 |
| 开发与部署基线 | 正式稳定 Release `v2.2.2.post1`，发布于 2026-10-22；提交 `b6715daabaa4f966626317452980fb84b8be9ab9` |

QwenPaw 固定为 `qwenpaw==2.2.2.post1` 或上述提交。Page Assist 使用 Fork tag
`remote-agent-preview-1`（提交 `c9eddc0d236bc58944bb0613ec317dd12d548bf1`），其上游基线为
`v1.5.88` 及其 `bun.lockb`。v0.1.0 明确采用该预览 tag；除此之外不使用预发布版、开发分支或浮动
latest。QwenPaw 版本选择依据为官方 Release 的 `draft: false`、`prerelease: false`；
后续升级稳定版需另行验证和更新基线。集成的 `main` 跟踪开发引用；上述固定适用于在 `release/vX.Y.Z` 分支上组合的发布版本。

本版替代 v1.1 的 OpenClaw 方案。为保留仓库已有链接，项目目录暂沿用历史名称 `page-assist-openclaw`，不表示仍需部署 OpenClaw。

## 1. 目标与设计原则

在 Chrome 侧边栏中复用 Page Assist 的网页读取和聊天体验，将用户明确选择的网页上下文发送给远程 QwenPaw 的指定 Agent，使用该 Agent 的原生会话、工作区记忆及工具策略回答问题。

核心职责：

- **Page Assist：** 当前页面采集、快照预览、Agent 选择、输入、结果展示和人工审批界面。
- **QwenPaw 接入模块：** 浏览器访问权限、Agent 白名单、会话绑定、上下文封装、请求记录、事件过滤及前端协议适配。
- **QwenPaw 原生服务：** Agent 运行、会话历史、记忆、后台任务、审批、工具治理与执行。

接入模块是 QwenPaw 的进程内功能模块，优先以 PawApp 后端插件实现；不启动第二个 Web 服务，不通过本机 HTTP 调用自身管理接口，不运行另一套 Agent。

设计原则：

1. 优先使用公开插件 SDK 和宿主已有服务，避免复制会话、任务、记忆和审批系统。
2. 浏览器是新的交互入口，不是工具权限裁决方。
3. 审批遵循 QwenPaw 已有流程和授权语义，不改造核心审批逻辑，不强求兼容旧方案的 `allow_once`。
4. 接入模块保留访问控制和请求恢复职责，但不扩展 Agent 原有工具权限。
5. 不向浏览器复制记忆，不引入客户端向量库，不重复发送完整远程历史。
6. 状态以原生服务和已持久化记录为准；无法确认时明确显示未知，不自动重发可能执行过的任务。

“结合记忆”表示请求进入指定 Agent 的正常运行路径，不保证每次回答都会检索全部记忆。

## 2. 第一版范围

### 2.1 包含

- Chrome 原生侧边栏，一个远程 QwenPaw 服务连接。
- 受服务端授权限制的 Agent 列表和选择。
- 当前网页正文、选中文字或不附加网页三种模式。
- 快照预览、刷新、大小提示及显式分享。
- 流式回答和同一会话连续追问。
- 不同 Agent、用户、App 和聊天的会话归属检查。
- 复用所选 Agent 的既有记忆与工具策略。
- 原生待审批展示、批准、拒绝及目标版本支持的授权范围选择。
- 断线后的请求查询、待审批对账及多端状态更新。
- 明确的失败、取消请求中、结果未知和恢复不可用状态。

第一版只承诺经过验证的原生 `qwenpaw` 后端 Agent。其他后端按能力单独验证，不能因出现在 Agent 配置中就默认开放。

### 2.2 不包含

- 点击、输入、表单提交等浏览器自动操作。
- 多标签页自动采集、截图、OCR、复杂 PDF、跨域 iframe。
- 客户端 RAG、独立 Agent 循环或第二套记忆服务。
- 自动“收藏到长期记忆”及跨设备完整历史同步。
- 自动跨 Agent 转交聊天。
- 新增审批引擎、修改治理规则生成逻辑、实现新的“一次性批准”语义。
- 绕过原生审批、沙箱或执行端限制。
- 在扩展内代办 OAuth、系统提权等外部认证。
- 普通单账户实例上的完整多租户管理。
- 进程重启后自动续跑中断任务或承诺工具执行 exactly-once。

读取当前网页不依赖 CDP、Playwright 或 `chrome.debugger`。QwenPaw 服务端可能具有其他浏览器工具，不代表扩展因此获得本地浏览器控制权限。

## 3. 目标使用体验

```text
┌──────────────────────────────────┐
│ QwenPaw                          │
│ 服务：My Remote QwenPaw     在线  │
│ Agent：[UWB Researcher        ▼]  │
│ 对话：UWB 技术资料分析            │
├──────────────────────────────────┤
│ 网页上下文                       │
│ [ ] 附加当前网页                 │
│ 模式：[正文 ▼]  [预览] [刷新]     │
│ 来源：某篇技术文档                │
│ 状态：已读取 · 8,240 字符         │
├──────────────────────────────────┤
│ 用户：结合项目背景分析当前方案。  │
│ Agent：根据既有约束和当前文档……  │
├──────────────────────────────────┤
│ 输入问题……              [发送]  │
└──────────────────────────────────┘
```

基本流程：

1. 配置 QwenPaw 接入地址及浏览器专用凭据。
2. 获取允许访问且能力符合要求的 Agent。
3. 创建与所选 Agent 固定绑定的聊天。
4. 用户选择是否分享网页，预览实际将发送的快照。
5. 提交一条新消息，订阅该请求的输出。
6. 需要审批时展示可信原生审批，说明批准的实际范围。
7. 等待原生服务处理决定和后续执行，不重新提交用户消息。
8. 后续追问使用同一远程会话。

默认不分享网页。切换标签页不上传、不切换聊天，也不自动刷新已确认快照。

审批卡片展示工具、所属 Agent／会话、服务端提供的操作目标、风险说明、有效期和授权范围。若原生批准可能在当前会话内记住精确目标，必须明确说明，不能标为“仅允许本次”。目标版本支持泛化授权时，展示匹配范围及其影响；接入策略可以只开放原生选项的较小子集。

普通聊天澄清仍通过聊天回答；外部认证引导至可信入口，不伪装为通用批准按钮。

## 4. 总体架构与模块边界

```text
Chrome / Page Assist Fork
├── 侧边栏、Agent 选择、快照预览
├── 当前页面 DOM → 正文 / 选区
└── QwenPaw Remote 专用 transport
              │ HTTPS + 浏览器专用凭据
              ▼
QwenPaw 进程
├── 宿主认证 / 受限客户端访问检查
├── Page Assist 接入模块（PawApp 后端插件）
│   ├── Agent 白名单与会话归属
│   ├── 网页上下文校验与封装
│   ├── 请求账本、去重与恢复
│   ├── 输出流和审批事件过滤
│   └── 浏览器 API
├── PawAppContext / 原生应用服务
│   ├── 会话与历史
│   ├── 后台任务与状态
│   └── 审批查询与决定
└── Agent Workspace
    ├── Runtime
    ├── 工作区记忆后端
    └── 工具治理、沙箱与执行
```

### 4.1 技术选型

| 层次 | 选择 | 说明 |
| --- | --- | --- |
| 扩展工程 | Page Assist v1.5.88 的 WXT、React、TypeScript | 固定发布提交和锁文件，保留普通模型模式 |
| 页面读取 | 现有采集机制及 Defuddle / Markdown 提取器 | 读取当前 DOM，不由服务器重抓替代 |
| 扩展规范 | Manifest V3、Side Panel API | 按需获取页面权限 |
| 服务端模块 | Python、稳定版 `qwenpaw.pawapp` 与 PluginApi | 复用宿主 Web 服务与生命周期 |
| 传输 | HTTPS + 可携带认证头的 SSE 请求 | 输出订阅与审批事件逻辑分离 |
| 原生调用 | PawAppContext、ChatManager、TaskTracker、ApprovalService | 通过集中适配层调用，不使用开发版聚合 SDK |
| 模块状态 | 复用宿主持久化能力，补充模块请求账本 | 不再默认新增独立 SQLite 服务 |
| 执行与记忆 | 目标 Agent 原生配置 | 不创建新工作区或替换记忆后端 |

稳定版已有基于 SafeJSONSession 的 App 存储，但它不是事务请求账本。请求接受、负载冲突检查、会话占用和状态落盘必须在明确的并发控制下完成。若现有能力不足，使用宿主已有事务存储或模块本地事务存储；不能仅凭存在存储 API 就宣称具备原子幂等。

第一版按单个 QwenPaw 执行进程设计，不承诺多 worker 共享锁、事件和内存审批状态。

### 4.2 复用优先级

1. 使用稳定版 `qwenpaw.pawapp` 的 `PawApp`、`PawAppContext`，通过 `include_router()` 注册模块路由，沿用 PluginApi 加载流程。
2. 复用 ChatManager、TaskTracker 和 ApprovalService；运行输出由 TaskTracker 包装原生聊天生成器并分发。
3. 在模块中补充浏览器特有的协议、授权、快照和请求记录。
4. 稳定版没有 `qwenpaw.plugins.apps`、新版 AppContext 聚合任务／审批接口和 SDK 事件总线。所需宿主服务通过固定版本的集中适配层接入，不从开发分支移植新版 SDK；接口不足时先缩小范围或引导 Console。

不把接入模块实现成模型可调用的 Skill 或工具。HTTP 路由、凭据校验和人工审批入口不能由网页脚本或 Agent 工具直接获得授权。

### 4.3 内置部署的取舍

收益是少一个服务和协议转换层，并能直接关联原生会话、任务与审批。代价是模块与 QwenPaw 共用故障域和升级周期；同进程插件不是进程级隔离。

复用稳定版启动／关闭钩子，明确跟踪模块后台任务、订阅、连接和存储关闭，不假定已有开发版的资源托管和安全热重载机制。第一版通过排空运行任务后重启服务更新模块，不提供运行中热重载；中断任务不自动重新执行。

## 5. Page Assist 改造

### 5.1 复用与新增

| 能力 | 处理方式 |
| --- | --- |
| 侧边栏、主题、Markdown 展示 | 复用 |
| 正文、选区提取 | 复用 |
| 本地聊天列表与缓存 | 增加远程绑定和恢复状态 |
| 普通模型提供商 | 保留原行为 |
| Remote Agent Provider | 新增独立 transport 分支；QwenPaw 是首个后端 |
| Agent 选择、上下文卡片 | 新增 |
| 审批展示与事件恢复 | 适配 QwenPaw 原生语义 |

Remote Agent 模式中：

- “模型选择”改为授权 Agent 选择，不允许覆盖底层模型和工具配置。
- 不调用 Page Assist 本地 Agent、MCP 或本地记忆。
- 不默认注入“仅根据网页回答”等全局 Prompt。
- 只提交当前新消息和新增快照，不重复上传完整历史。
- 仅可信服务端审批数据可以生成操作卡片。

### 5.2 绕过原网页问答链

Page Assist 普通网页聊天可能包含检索、问题改写和最终回答等多次模型调用。Remote Agent 模式不能简单替换其中的模型，否则内部改写任务可能产生多次 Agent 执行并污染历史。

```text
用户问题 + 已确认快照
    → 一次接入请求
    → 指定原生 Agent 运行
    → 输出与状态展示
```

### 5.3 v1.5.88 源码核对结论

已只读分析单独的本地 Page Assist 检出。该工作树提交比发布标签更新，但与发布提交的差异仅为 README；以下代码结论适用于固定发布提交，不以 main 分支作为实施依据。

| 已核实入口 | 当前行为 | 对本方案的影响 |
| --- | --- | --- |
| `src/entries/sidepanel/App.tsx` | 挂载 MemoryRouter、主题、i18n、React Query 和 PageAssistProvider | 保留外层基础设施，新增远程页面，不另起扩展 |
| `src/routes/chrome.tsx` → `src/routes/sidepanel-chat.tsx` | 侧边栏 `/` 进入本地聊天；恢复最近 copilot 历史、加载默认 Prompt、处理后台消息并自动提交 | 不能仅更换模型选择器，远程模式必须避开这些自动行为 |
| `src/components/Sidepanel/Chat/{header,form,body,empty}.tsx` | 多处直接调用 `useMessage()`；表单校验 selectedModel、队列、变量替换；空态查询 Ollama | 不原样挂载这些本地容器，不要求用户先配置 Ollama |
| `src/hooks/useMessage.tsx` | 侧边栏实际发送入口；选择普通聊天、网页、图片、Page Action、WebMCP 等分支，并支持编辑／再生成／分支 | QwenPaw 不进入该 hook 的发送与本地历史改写路径 |
| `src/hooks/useMessageOption.tsx` | Web UI 使用另一条发送链 | 第一版只支持侧边栏远程模式，不顺带改造 Web UI |
| `src/libs/get-html.ts` | 注入函数读取完整 outerHTML，再走站点解析、PDF 下载或 YouTube transcript 等分支 | 只复用注入和提取思路，不能直接作为受限快照接口 |
| `src/parser/default.ts` | Defuddle 转 Markdown；失败后清理 DOM 再尝试 Markdown，最终可能返回空字符串 | 复用转换；远程包装必须把空结果和异常显式报告，不发送原始 HTML |
| `src/db/dexie/schema.ts` | PageAssistDatabase 已有版本 1–5 | 增加版本 6 的远程表，不修改旧版 schema 定义 |
| `src/libs/export-import.ts` | 全量导出可能读取整个 storage.local 和 storage.sync | 新凭据必须加入导出／导入排除规则，仅使用 local 不足以避免泄露 |
| `wxt.config.ts` | Chrome 已声明广泛 HTTP、HTTPS、file host_permissions；manifest.version 为 1.5.88 | 不能宣称已有最小站点权限，需区分 Fork 权限与远程模式授权 |

发布版本由标签和 `wxt.config.ts` 的 manifest 确定，**不是** `package.json` 中仍为 `1.0.9` 的工程版本。保留 Page Assist 的 MIT 版权与许可声明。

### 5.4 页面组织与状态隔离

采用独立路由和页面容器，不把远程模式塞入 `chatMode: normal | rag | vision`，也不把 Agent 注册为模型提供商。

- 在 `src/routes/chrome.tsx` 增加 `/qwenpaw`、`/settings/qwenpaw`。
- 将侧边栏根入口调整为轻量模式选择／恢复入口，根据本地保存的用户选择进入原本地聊天或 QwenPaw 页面。首次仍默认普通模式。
- 新增远程页面容器和专用 `useQwenPawChat` 控制器，普通页面继续使用 `useMessage`；远程页面不挂载本地 header/form/empty，避免隐藏的 Ollama 查询、自动提示词或后台自动发送。
- 外层主题、语言、QueryClient 和布局样式继续复用。消息展示优先复用 `PlaygroundMessage`／Markdown，传入已转换的展示 DTO，不复用本地发送容器。
- 远程状态独立保存连接、Agent、conversationId、requestId、快照和审批状态；不复用 `selectedModel`、本地 `historyId` 或本地 RAG store。
- 消息列表、审批列表和请求状态只由一个页面级控制器管理；展示组件通过 props 获取数据，避免多个 hook 实例各自订阅造成重复通知或重复提交。

切回本地模式不修改原 selectedModel 和本地聊天配置。切到远程聊天只恢复缓存和查询状态，不触发原最近聊天加载逻辑，不发送历史。

### 5.5 UI 复用、控件与后台入口

建议新增 `src/components/Sidepanel/QwenPaw/`，按实际规模组织连接／Agent 区、快照卡、消息区、输入区和审批区，不复制整套本地表单。

远程模式的控件策略：

| 原控件／行为 | 远程模式 |
| --- | --- |
| 模型选择、模型参数、系统 Prompt | 使用服务与 Agent 选择，不覆盖原生配置 |
| 网页 RAG、embedding、知识库、客户端记忆 | 不显示、不初始化 |
| Page Action、WebMCP、本地 MCP 审批 | 不显示，不能把本地 pendingMcpApproval 当成远端审批 |
| 图片、拖放文件、OCR、`@tab` 多标签 | 第一版禁用，粘贴／拖入时明确提示，不静默忽略附件 |
| 自动消息队列 | 第一版不使用；运行或待审批期间阻止下一次发送 |
| 编辑、再生成、继续生成、聊天分支 | 禁用；这些本地操作会删改历史或再次调用模型，不能等同于远程操作 |
| 清空上下文 | 改为显式新建远程聊天，不暗示能擦除远端已接收内容 |
| 临时聊天 | 第一版不提供“不留存”按钮，提示远程会话按 QwenPaw 策略保留 |
| 普通 Stop 按钮 | 不复用本地 abort 即取消的语义；第一版只提供停止显示／重新连接或隐藏取消按钮 |
| 复制、Markdown、滚动、主题和语言 | 复用已有展示能力 |

`PlaygroundMessage` 已有 `hideEditAndRegenerate`、`hideContinue` 等展示选项。远程容器应隐藏不支持的动作，必要时补齐动作可见性；不能只把回调置空却仍显示可点击按钮。远端工具信息只作展示，不接到本地工具执行器。

`background.ts` 的选区菜单会发送 summary／translate 等消息，原 `sidepanel-chat.tsx` 收到后可能自动提交；YouTube 消息也走自动分支。因此：

- 远程页面不继承该自动提交 effect，也不复用默认摘要／翻译模板。
- 第一版提供独立“附加选中文字”操作，或把现有选区消息转换为**待确认快照／草稿**，只在用户预览并点击发送后提交。
- 若扩展后台接收远程模式专用选区事件，需携带 tabId、来源 URL、标题、采集时刻和类型；校验扩展入口与当前标签关联，不将任意 runtime 消息视为用户确认。
- 普通模式的原上下文菜单行为保持不变。远程服务请求和审批决定不暴露为内容脚本可调用的通用消息 RPC。

### 5.6 专用页面快照适配器

建议新增 `src/libs/qwenpaw/page-context.ts`，复用 `defaultExtractContent()`，不直接调用 `getContentFromCurrentTab()` 的多站点处理链。

采集顺序：

1. 用户点击读取／刷新后，在侧边栏查询活动 tab，先固定 tabId 和候选 URL。
2. 仅支持 HTTP／HTTPS 顶层 HTML。PDF、浏览器内部页、扩展页和不可注入页面显式报不支持；不触发下载、字幕抓取或外部模型处理。
3. 用 `scripting.executeScript` 在隔离环境读取页面实际 URL、标题、contentType、正文 DOM 或 `window.getSelection()`；只采集主 frame，不读取表单 `.value`、Cookie 或存储。
4. 正文模式对克隆 DOM 移除 script/style、表单输入及编辑区域等不应分享节点后序列化，在扩展侧调用原正文转换器；不修改网页原 DOM。HTML 只作本地临时输入，不写入请求、日志和长期缓存。
5. 以注入时返回的实际 URL 为准核对导航竞争；若 tab 已变化或不是支持类型，作废采集结果。
6. 清理来源 URL，检测空正文，执行字符限制、明确截断和 hash 计算，形成不可变待分享快照。
7. 预览和发送复用该对象；发送前再次核对目标 tab／URL，变化时要求重新确认，不静默重采集。动态内容新鲜度不能确定时提示刷新。

选区模式只返回所选文本，不上传整个页面。独立右键菜单携带的 selectionText 也先变成待确认快照。事件监听可以标记当前快照过期，但不得因此自动采集或上传。

现有 `getDataFromCurrentTab()` 的部分异常路径不能保证显式完成；新包装使用可拒绝的 async 调用、超时和类型校验，不将空值、无注入结果或权限错误伪装为成功。原普通模式函数保持不变。

### 5.7 配置与本地数据库

连接配置使用明确的 `Storage({ area: "local" })` 或等价宿主封装；不能照搬默认 Storage 实例而假定不会同步。凭据单独保存在 local 专用键，不放进 Dexie 远程表、普通模型配置或 React Query key。

新增 Dexie **version 6**，保留版本 1–5 和现有表数据，建议三个表：

| 新表 | 键与必要字段 | 作用 |
| --- | --- | --- |
| `qwenpawConversations` | 本地 id、connectionId、principalScope、agentId、conversationId、title、updatedAt | 固定远程绑定，提供独立聊天列表 |
| `qwenpawRequests` | `[connectionId+requestId]`、conversationLocalId、规范化负载／摘要、提交状态、远程状态、updatedAt | 刷新后恢复与重复提交保护 |
| `qwenpawMessages` | 本地 id、conversationLocalId、requestId、remoteMessageId、role、content、展示状态、updatedAt | 流式展示缓存与重建 |

索引按查询需要设置，不把以上所有字段都机械建索引。会话创建响应到达但本地落盘失败时显示恢复错误，不自动再创建第二个远程聊天。发送前在同一事务中记录请求 ID、实际负载和展示占位；先落盘再发起网络操作，恢复时只重连／查询，不自动重发。

网页正文只在明确分享后的必要恢复记录中保存并按期限清理，未发送快照默认留在内存。消息增量节流写入、终态立即落盘；快照重建时按远端消息 ID／请求 ID 替换，不追加第二份回答。

第一版使用独立远程聊天列表，不直接把绑定写进普通 `chatHistories.model_id`。现有 `Sidebar.tsx` 会恢复模型和提示词，旧编辑／删除助手也按本地语义处理，因此不让其加载远程表。普通历史自动恢复、Web UI 和导入导出继续只处理原本地记录。

远程列表的“移除本地缓存”不等同删除服务端会话；第一版没有远程删除功能，不暗示已清除原生历史。切换凭据需使旧连接缓存脱离当前身份，重新认证对账后才能恢复，不能把缓存命中当授权依据。

### 5.8 请求传输与恢复控制器

建议集中在 `src/services/qwenpaw/` 实现类型、客户端和流解析，页面 hook 只编排 UI：

- URL 以配置服务地址为基准构造，只调用固定 `/api/page-assist` 路径；正式远程访问要求 HTTPS，不接受网页或模型提供的服务跳转。
- 客户端自动添加认证头，校验 HTTP 状态和响应结构；401／403、冲突、限流和服务错误分别展示，不进入普通模型 fallback。
- 流式 fetch 使用 TextDecoder 保留跨 chunk UTF-8 状态；SSE 解析支持分片、CRLF、多行 data、心跳和 EOF，不能对每个网络 chunk 直接 JSON.parse。
- 控制器区分提交、运行、待审批、断线、恢复、终态和未知；同一会话一个活动请求，审批等待时仍锁定输入。
- 允许自动重连只读事件订阅，不能自动重试创建聊天、发送消息或审批决定这类写操作。结果未知时先查询；显式重试决定使用原 decisionId，并遵守服务端幂等结果。
- 每次打开远程页面先加载本地未终结请求，再查询服务端请求状态、原生消息恢复和待审批；完整历史或消息快照通过接入协议返回，不直接让浏览器访问 QwenPaw 管理历史接口。
- 输出和审批订阅独立。页面卸载／连接切换时释放 AbortController、监听器和轮询；只结束订阅，不因此向服务端发送拒绝或取消。
- 第一版网络连接由可见侧边栏页面持有，不把长连接生命周期押在 MV3 service worker 上。侧边栏关闭后原生后台任务继续；重新打开时恢复。

审批卡片是单独的受信 DTO，不从 Markdown 或聊天字符串中推断。UI 处理原生授权范围与可信 Console 回退，不修改 QwenPaw 审批核心。

### 5.9 权限、凭据与导入导出

v1.5.88 已有广泛 host_permissions，且普通模型模式依赖任意模型服务器。轻量 Fork 第一版保留既有权限以保持兼容，不宣称整个扩展已实现最小站点权限；QwenPaw transport 仍仅允许配置中的服务 origin，并限制消息入口。将全扩展权限改为 optional_host_permissions 需要单独迁移，不能只删除通配权限而破坏普通模型访问。

凭据保护必须覆盖实际路径：

- 审查 `src/libs/export-import.ts` 的全量 storageLocal／storageSync 导出，在序列化前剔除新凭据键和任何含凭据的远程配置。
- 导入时拒绝恢复这些凭据键，导入连接信息后要求重新配置认证。不能依赖导出时脱敏来相信任意导入文件。
- 第一版新增远程表不默认加入全量备份、公开分享和普通聊天导出；UI 明确远程展示缓存不包含在旧导出中。
- 不写入默认 Storage、Content Script、URL、模型配置或日志，不通过后台消息返回原始凭据。
- 复用原有 Markdown 安全展示边界；不为远端消息启用任意 HTML 或本地工具动作。

### 5.10 建议文件级改动与交付顺序

以下新增路径是实现建议，不表示源码中已存在：

| 文件／区域 | 改动 |
| --- | --- |
| `src/routes/chrome.tsx` 与侧边栏根入口 | 新路由和显式模式选择，不修改 Web UI 发送链 |
| 新 `src/routes/sidepanel-qwenpaw.tsx`、`sidepanel-settings-qwenpaw.tsx` | 独立远程页面和不依赖 Ollama 的连接设置 |
| 新 `src/components/Sidepanel/QwenPaw/` | 远程控件、快照、独立历史和审批展示 |
| 新 `src/hooks/useQwenPawChat.ts` | 单一页面级状态机、提交与恢复编排 |
| 新 `src/services/qwenpaw/` | 固定应用协议、凭据配置、客户端、SSE 和 DTO 校验 |
| 新 `src/libs/qwenpaw/page-context.ts` | 当前页／选区的受限快照适配 |
| `src/db/dexie/schema.ts`、`types.ts` 与新远程 repository | version 6、独立表、事务与缓存清理 |
| `src/entries/background.ts` | 必要的选区草稿入口，保留普通菜单行为 |
| `src/libs/export-import.ts` | 新凭据导出／导入排除 |
| 现有共享消息组件与语言资源 | 只补必要动作开关及中英文文案 |

优先实现“连接 → Agent → 无网页聊天 → 连续追问 → 断线恢复”，再接“快照预览与分享”，最后接“原生审批”。每一步保持普通侧边栏和 Web UI 可用，避免先大改模型工厂或整个 useMessage。

## 6. 身份、Agent 与会话模型

### 6.1 认证与授权

浏览器使用单独、可撤销、受限的客户端凭据，不保存 Console 管理凭据。优先复用宿主认证设施，补充必要的接入权限检查；不另建独立账户体系。

凭据只能访问接入模块命名空间，限制其允许的 Agent、聊天与审批操作。认证衔接必须在宿主中间件／路由授权边界落实：既不能被宿主提前拒绝，也不能让受限凭据访问配置、终端、任意文件或其他管理接口。

聊天权限与审批权限分别检查。凭据撤销和 Agent 权限变更对后续请求立即生效，前端隐藏按钮不能替代服务端校验。

普通 QwenPaw 认证是单账户设计，且默认不开启登录。正式远程部署必须显式启用并完成认证初始化，不能依赖默认配置或私网可达性作为认证。

第一版以个人实例为主。需要真实多用户时采用并验证 QwenPaw Hub 的身份与隔离方式，而不是把普通实例视为完整多租户服务。会话隔离也不保证同一 Agent 的长期记忆按用户隔离；不同用户的敏感记忆应使用隔离的 Agent 工作区或实例。

### 6.2 Agent 发现

从稳定版 Agent 配置及宿主 Agent 管理服务获取候选 Agent，经集中适配层过滤：

- 当前凭据允许的 Agent。
- 已启用、可用且满足第一版后端约束的 Agent。
- 接入策略允许展示的名称、描述和能力。

不向浏览器返回工作区绝对路径、模型凭据或完整配置。Agent 选择器不是权限边界；每次消息和审批操作重新检查授权，不回退到其他 Agent。

### 6.3 会话绑定

每个聊天固定绑定：

```text
服务实例 + 认证主体 + 接入 App + Agent ID + conversationId
```

模块创建不可猜测的 `conversationId`，映射到原生会话 ID／聊天记录 ID。使用 App 命名空间、认证主体和固定频道构造隔离的原生会话，并校验 ChatSpec 归属；不能假定稳定版自动具备新版 SDK 的用户哈希会话命名空间。不把 `conversationId`、原生 `session_id`、聊天记录 ID 和单次请求 ID 当成同一个标识。

客户端消息只指定 `conversationId`，不能通过查询参数或请求头覆盖用户、Agent、原生会话键、模型或工具配置。

| 操作 | 行为 |
| --- | --- |
| 同一聊天追问 | 复用原生会话 |
| 新建聊天 | 创建新原生会话，仍可使用 Agent 长期记忆 |
| 切换 Agent | 进入或创建其独立聊天，不迁移历史 |
| 切换标签页 | 保留聊天，更新待分享页面状态 |
| 切换服务 | 使用独立聊天空间与凭据 |

归档、删除、权限失效或原生会话不可用时明确报错，不偷偷新建会话替代。

### 6.4 数据归属

| 位置 | 数据 |
| --- | --- |
| 扩展 | 服务配置、本地展示缓存、conversationId、请求 ID、快照元数据 |
| 接入模块 | 权限配置、原生会话映射、请求账本、事件恢复记录、必要审批操作审计 |
| QwenPaw 原生服务 | 权威会话历史、工作区记忆、任务和审批实际状态 |

模块不维护第二份完整会话历史。恢复缓存和本地展示缓存应有保留期限；过期明确报告无法恢复。

## 7. 网页上下文

### 7.1 模式与快照

| 模式 | 内容 |
| --- | --- |
| 不附加 | 只有用户问题 |
| 选区 | 选中文字、标题、清理后的 URL |
| 正文 | 当前 DOM 提取的 Markdown、标题、清理后的 URL |

以下为本方案的应用数据，不是 QwenPaw 原生 DTO：

```json
{
  "type": "webpage",
  "title": "Example technical document",
  "url": "https://example.com/docs/article",
  "capturedAt": "2026-10-23T07:35:00Z",
  "mode": "article",
  "content": "...Markdown 正文...",
  "contentHash": "sha256:...",
  "truncated": false
}
```

预览和发送必须使用同一快照。`contentHash` 基于规范化来源及实际分享内容计算，服务端校验，不只相信客户端声明。

### 7.2 采集与隐私

- 默认移除 URL fragment，过滤敏感查询参数。
- 不读取密码框、表单输入值、Cookie 和 Local Storage。
- 正文可能包含敏感信息，必须允许预览和取消。
- 受限页面或提取失败明确报错，不静默上传完整 HTML。
- 登录后的正文从当前 DOM 提取，服务器重抓 URL 不能替代。

### 7.3 大小、新鲜度与去重

正文建议上限为 **30,000 字符**，不是模型 Token 上限。超限时提示改用选区或由用户明确确认截断，预览显示截断状态，不隐藏启动额外模型总结。

服务端另行限制问题长度、总请求体和模型上下文预算，具体值在实施时记录。

发送前检查 tab、URL 和快照匹配。导航、内容变化或新鲜度不确定时提示刷新；不能只凭 URL 不变就宣称快照最新。

只有同一远程会话中已确认接收成功的相同快照才能省略重发。结果未知时先查询请求，不凭点击过发送就标记附件已提交。页面变化后作为新附件；移除附件不会让原生会话忘记已接收内容，需要隔离时新建聊天。

## 8. 原生运行路径与记忆复用

### 8.1 接入路径

```text
已授权 conversationId
    → 解析固定 Agent 和原生会话
    → 校验并封装当前新消息及网页快照
    → TaskTracker 持有 PawAppContext.chat_stream() 生成器
    → Workspace.stream_query()
    → 原生 Runtime、记忆和工具治理
```

稳定版 PawAppContext 已提供 `chat_stream()`、会话创建和历史等能力，并进入 `Workspace.stream_query()`。后台任务和审批通过适配层复用宿主 TaskTracker、ApprovalService，而不是调用稳定版不存在的 `AppContext.start_task()`、`approvals()` 或 `for_workspace()`。不新增 Agent 实例，不通过 OpenAI `model` 字段路由 Agent，不使用稳定 `user` 派生会话。

单独调用流式聊天接口并不自动保证断线后继续运行。正式发送复用 TaskTracker 的 `attach_or_start()`、`attach()` 和 `stream_from_queue()` 模式，让原生任务持有聊天生成器，浏览器只订阅输出。稳定版 Console 已使用这一模式；不通过 HTTP 调用 Console handler。TaskTracker 可为存活运行提供内存输出重放，但不是跨进程持久事件日志；运行结束后结合模块终态记录与原生历史恢复。

### 8.2 请求与生命周期

每次新消息使用独立 `requestId`。原生后台任务可能以聊天记录标识跟踪运行，不能把该标识作为每轮消息的永久唯一 ID。

同一会话至多一个进行中的消息请求，审批等待期间仍占用该位置。重复提交复用模块请求记录，不依赖原生 `request_id` 字段自动实现幂等。

模块先持久化接受记录，再启动原生执行。启动前后崩溃的中间状态必须对账；无法确认是否已启动时记为未知，不能自动重跑。稳定版 TaskTracker 不提供新版 SDK 的磁盘任务快照，模块应记录接受和终态，原生历史负责完整消息；不能把运行缓存当成持久化完成证明。

### 8.3 上下文封装

将问题和网页资料分成清晰区块，保留标题、来源、采集时间和截断状态。网页是不可信参考数据，不能提升为 system 指令，也不能据此改变模型、工具或审批策略。

使用普通文本消息进入原生运行路径即可，不要求改造核心消息结构。分隔符只是帮助模型区分内容，不能替代工具治理。

### 8.4 记忆前置检查

- Agent 绑定正确工作区及原生后端。
- 实际记忆后端可用；不能仅凭产品介绍假定 ReMe 已启用。
- 需要时具备记忆检索能力，索引和模型配置可用。
- 新聊天可使用长期记忆，但不继承另一聊天的短期历史。
- Agent 间及用户间共享记忆的边界符合部署需求。
- 上下文预算、裁剪和工具策略不阻断目标能力。

客户端只展示可验证的服务端状态，不伪造“已检索记忆”。

### 8.5 写入与保留

第一版没有收藏按钮，但原生会话记录、记忆工具、自动记忆和后台维护仍可能保存网页资料。沿用 QwenPaw 配置与策略；若要求禁止长期记忆写入，必须在服务端配置并验证，而非依靠前端开关或 Prompt。

“不写长期记忆”不等于“不保存会话”。不留存模式需要另行核实会话、日志、备份和模型供应商保留政策。

已有 OpenClaw 数据不属于协议直接兼容范围。如需迁移，迁移可读资料并重新验证索引、来源和权限，不直接复用旧索引或假定历史格式相同。

## 9. 接入模块 API

以下均为**拟新增的浏览器应用协议**，不是 QwenPaw 已有接口声明。建议 PawApp ID 为 `page-assist`，统一前缀为 `/api/page-assist`，在同一宿主服务中注册。

稳定版标准 PawApp 能力可作为实现参考，但浏览器只开放经过授权包装的模块路由。使用 `get_scoped_ctx` 的身份约束，不直接使用接受客户端身份声明的旧 `get_ctx` 作为远程授权边界；Agent 必须从服务端 conversation 映射解析，不能相信默认查询参数。不能暴露通用存储、任意工作区选择或完整管理 API。

所有接口携带认证头；主体身份由服务端确定。SSE 使用支持认证头的流式 fetch，不将凭据放入 URL。

### 9.1 能力与 Agent

```http
GET /api/page-assist/capabilities
GET /api/page-assist/agents
```

能力响应说明协议版本、上下文限制及支持的恢复／审批能力，并提供非敏感的服务实例标识和当前认证作用域标识，便于前端识别服务或凭据切换。它们只作缓存分区，不能代替服务端授权。Agent 响应仅包含展示和选择所需字段，例如：

```json
{
  "agents": [
    {
      "id": "uwb-researcher",
      "name": "UWB Researcher",
      "description": "分析技术文档和项目方案"
    }
  ]
}
```

### 9.2 创建聊天

```http
POST /api/page-assist/conversations
```

```json
{
  "agentId": "uwb-researcher"
}
```

响应包含服务端生成的 `conversationId` 和固定 `agentId`。创建原生会话并保存归属映射，不接受客户端指定所有者。

### 9.3 提交消息

```http
POST /api/page-assist/conversations/:id/messages
```

```json
{
  "requestId": "client-generated-uuid",
  "text": "结合项目背景，分析这个方案。",
  "pageContext": {
    "type": "webpage",
    "title": "Example",
    "url": "https://example.com/docs",
    "capturedAt": "2026-10-23T07:35:00Z",
    "mode": "article",
    "content": "...",
    "contentHash": "sha256:...",
    "truncated": false
  }
}
```

不附加网页时省略 `pageContext`。接受后返回请求标识及状态，前端另行订阅输出；此时只表示接受，不表示完成。

服务端校验：

- 用户、会话和 Agent 的授权与固定绑定。
- 请求 ID 的归属及规范化负载摘要。
- 问题、快照、hash 和总请求体限制。
- 同一会话没有另一进行中的请求。
- 不接受任意上游路由头、原生会话键或模型／工具覆盖。

相同 ID、相同负载返回已有记录；相同 ID、不同负载返回冲突。已结束后重试也不能启动第二次执行。

### 9.4 请求查询与输出

```http
GET /api/page-assist/requests/:requestId
GET /api/page-assist/requests/:requestId/events
GET /api/page-assist/conversations/:id/messages
```

| 应用状态 | 含义 |
| --- | --- |
| `accepted` | 已记录，尚未确认原生运行开始 |
| `running` | 原生任务运行中 |
| `waiting_approval` | 已关联待审批，仍占用会话 |
| `completed` | 原生完成且结果已确认 |
| `failed` | 已知失败 |
| `cancelled` | 原生确认已停止，不能仅凭断流设置 |
| `unknown` | 可能执行过，当前无法确认 |

这些是接入协议状态，不要求修改原生任务枚举。稳定版 TaskTracker 的运行／空闲状态不足以判断完成、失败或曾经执行，必须结合模块终态与原生历史；宿主重启后无法核实的运行映射为未知，不能视为“从未执行”。

输出事件区分消息增量、状态、错误和终态。流结束不等于成功。恢复时优先返回已记录终态及原生历史；若无增量重放能力，则返回重建后的消息快照，并明确重置展示，避免重复拼接。

为使前端可直接实现，应用事件至少统一为以下类型；这些不是原生 QwenPaw 事件名：

| 事件类型 | 必要字段 | 前端动作 |
| --- | --- | --- |
| `request.state` | requestId、state | 更新请求状态，不仅凭连接存活判断运行 |
| `message.delta` | requestId、messageId、delta | 对指定助手消息追加可见文本 |
| `message.snapshot` | requestId、messageId、content、status | 替换指定消息，供重建／恢复使用 |
| `request.error` | requestId、code、message | 显示失败或未知，后续查询确认 |
| `request.terminal` | requestId、state | 与持久请求状态对账后结束订阅 |

消息历史接口只返回授权会话内可见的消息 DTO，含稳定消息 ID、关联 requestId、角色、内容及状态；不暴露模型内部推理、凭据或不必要的原生参数。分页／快照返回值应明确替换范围，不能把有限任务摘要当完整历史。

首轮实现可统一在订阅建立时发送已知消息快照，再发送新增量；重连时先中止旧订阅并替换快照，防止缓存重放重复追加。若原生无稳定消息 ID，由模块建立持久映射；事件顺序标识只保证当前订阅的顺序，不承诺跨进程重放。

### 9.5 审批列表、事件与决定

```http
GET /api/page-assist/approvals
GET /api/page-assist/events
POST /api/page-assist/approvals/:id/decision
```

待审批列表与聊天输出分离，切换聊天或结束输出订阅不会隐藏有权限处理的待审批。

列表通过 ApprovalService 查询原生 PendingApproval，复用审批展示辅助方法，补充模块的 conversation 关联和允许展示的操作；不依赖开发版 ApprovalSnapshot DTO。浏览器协议可适配原生批准决定与 `scope`；例如：

```json
{
  "decisionId": "client-generated-uuid",
  "approved": true,
  "scope": "exact"
}
```

`scope` 取值和含义以原生服务及接入能力声明为准。拒绝操作使用 `approved: false`，不授予范围。第一版不再定义旧协议的 `allow_once`。

模块验证审批权限、可信归属、当前有效状态和支持的操作，再通过集中适配层调用 ApprovalService 原生决定入口。不能直接把扩展用户当作 Console 管理员调用现有管理 handler；客户端不能修改命令、目标、Agent、会话或审批参数。

相同 `decisionId` 的重复提交返回已有处理记录；冲突决定不覆盖已确认结果。原生返回冲突、过期或对象不存在时，查询可用状态并对账；无法证明处理结果时显示未知，不伪造成功。

### 9.6 错误与取消

- 认证失败：要求更新凭据，不回退匿名。
- Agent 禁用或无权访问：报错并刷新列表，不改用默认 Agent。
- 原生会话不可用：提示恢复方式，不自动新建。
- 限流：显示重试信息，不自动重复已提交请求。
- SSE 错误或事件缺口：查询状态，必要时重建展示。
- 审批不可用：禁用操作，提供可信 Console 入口。
- 关闭扩展或停止读取 SSE：只取消订阅，不宣称远程任务停止。

第一版不必提供取消按钮。若提供，必须调用原生取消能力，并区分已请求、已确认停止和超时；不能只中断前端 HTTP。

## 10. 审批复用与恢复

### 10.1 原则

审批完全复用 QwenPaw 的原生服务、身份检查、工具治理和执行续接，不实现旁路批准，不修改核心规则生成行为。

原生 `exact` 表示精确目标范围，不保证单次有效；`similar` 表示更广的目标匹配。是否记住授权还受原生策略和审批来源影响。UI 应复用 Console 的术语和解释，必要时增加提示，不做跨来源的一次性承诺。

能力不确定、归属无法确认、操作详情不足或后端不支持时，保留聊天功能并引导可信 Console 处理；不得为了覆盖所有审批类型而重写审批系统。未支持的审批场景应在能力和验收记录中明确。

### 10.2 展示与处理

- 仅原生服务产生的待审批可以生成操作卡片；模型文本中的“请批准”不构成审批。
- 展示服务端实际工具和目标，保留风险信息，不用模型摘要替代。
- 仅展示经过验证的授权选项；泛化目标不能伪装为精确目标。
- 点击后先显示提交中，原生确认后才显示已批准或已拒绝。
- 批准不代表工具执行成功，也不能越过沙箱和文件权限。
- 原生服务恢复原任务，模块不重发问题、不自行执行命令。
- 过期、无响应、断线和插件关闭均不视为同意。

### 10.3 断线与进程重启

| 情况 | 处理 |
| --- | --- |
| 浏览器断线，宿主仍运行 | 查询任务与待审批，恢复授权范围内真实状态 |
| 其他客户端处理 | 通过原生审批状态轮询对账禁用旧按钮 |
| 收到事件缺口 | 重新查询，不把缺失事件当成未发生 |
| 模块更新或停用 | 排空任务后重启服务，未确认任务显式报中断或未知，不承诺安全热重载 |
| QwenPaw 进程重启 | 原生内存审批不能视为可恢复；核实任务与历史，不能重建旧 Future 或自动执行 |
| 决定已提交但响应丢失 | 查询模块记录与可用原生状态，无法确认则显示未知 |

稳定版没有新版 SDK 的审批事件总线。第一版通过原生待审批列表及任务状态的受控轮询生成浏览器通知，模块只承担过滤、关联与必要审计，不新增审批引擎。通知中断、序号不连续或重连时重新对账；待审批列表为空不能证明某个审批已经获准。

跨 Agent 子任务等无法在稳定版适配层可靠核实归属的审批，第一版引导 Console，不通过放宽所有者检查实现支持。

## 11. 远程部署、安全与保留

### 11.1 推荐拓扑

```text
Chrome
   │ HTTPS / Tailscale 等私网
   ▼
TLS 入口与路径访问限制（可复用已有反向代理）
   │
   ▼
QwenPaw
├── Page Assist 接入模块
└── 原生 Agent、会话、记忆、审批与工具
```

无独立 Bridge 进程、端口或 Node.js 依赖。QwenPaw 仅监听本机或受控网络接口，由既有 TLS 入口暴露必要路径；私网也必须认证。

远程入口只开放接入 API 和必要认证路径，不因共用端口就暴露所有 Console 管理功能。Console 如需远程访问，应采用单独管理策略。

### 11.2 凭据与浏览器边界

- 凭据存于扩展受控存储，不进入 Content Script、页面 DOM、URL、导出记录或同步存储。
- 页面读取按需使用 `activeTab`、`scripting` 等权限；远程权限只覆盖实际服务站点。
- 不依赖 CORS、Origin 或扩展 ID 作为唯一认证。
- 审批 UI 位于扩展侧边栏，不注入页面 DOM。
- 页面、模型和工具不能触发人工批准入口。
- 保持安全 Markdown 渲染，不执行返回的脚本或任意 HTML。
- Console 链接来自可信服务配置，不采纳网页／模型给出的管理 URL，不携带管理凭据。

### 11.3 日志、审计与保留

审计优先复用原生日志，模块补充认证主体、conversationId、requestId、原生关联、审批决定及确认结果，敏感参数脱敏。

常规访问日志不包含网页原文、模型回复或认证头。明确模块恢复缓存、事件缓存、本地聊天和原生会话的保留期限。

用户取消分享后不继续采集。网页资料仍可能因原生会话、记忆策略和备份保留；使用云端模型时还可能发送给模型供应商。网页提示注入不能赋予工具权限或记忆写入权限。

## 12. 实施计划

### 阶段一：固定基线与验证原生能力

使用非敏感测试 Agent，先不改 Page Assist：

1. 固定 QwenPaw `v2.2.2.post1` 及提交、Page Assist `v1.5.88` 及提交和锁文件，记录部署配置，不从本地 HEAD 推断发布能力。
2. 用稳定版 PawApp／PawAppContext 及集中适配层验证 Agent 路由、会话创建、连续追问及历史。
3. 用可区分事实验证两个 Agent 的记忆和新聊天边界。
4. 验证原生后台任务、输出事件及断线后的状态查询。
5. 触发真实审批，复用现有批准／拒绝和授权范围，核对原任务续接。
6. 验证审批过期、多端处理、轮询通知中断和宿主重启的实际行为。
7. 核对受限凭据接入宿主认证的方式，确认不能访问其他管理 API。

输出支持能力清单及明确限制，不为实现旧方案的一次性语义修改核心审批。

### 阶段二：实现内置接入模块

完成插件注册、权限过滤、Agent 列表、会话映射、上下文封装、请求账本、后台任务接入、输出订阅和状态恢复。

复用原生审批查询和决定，通过受控轮询补充前端通知、归属过滤、操作记录及 Console 回退。验证服务排空／关闭不会遗留任务和订阅。不建设额外知识库、会话历史库或审批引擎，不移植预发布 SDK。

### 阶段三：修改 Page Assist

按第 5 节文件级边界拆成可独立验证的步骤：

1. 新路由、模式切换和连接设置；无 Ollama 配置也能进入并连接。
2. version 6 远程表、受限配置、导出／导入凭据过滤和独立聊天列表。
3. 专用客户端／SSE／页面控制器，打通不附网页的原生连续对话与恢复。
4. 正文与选区快照、导航竞争检查、超限确认和用户显式分享。
5. 原生审批查询／决定、独立通知流和 Console 回退。
6. 逐项禁用不支持的本地动作，检查后台自动发送入口与普通模式回归。

保留普通模型模式，不把原网页问答链的内部步骤提交给 Agent。

### 阶段四：端到端与回归

使用真实 Chrome 和目标部署验证完整链路，记录配置、版本、实际支持的审批类型与恢复边界。通过下述验收后再将状态更新为“完整设计已验收”，不能以源码阅读或接口存在代替运行证据；v0.1.0 预览只覆盖基础频道链路。

前端验证使用发布版现有工程工具，不先引入新的测试框架：

- 工程已有 Bun 锁文件、`compile` 和 `build:chrome` 脚本，但没有统一 `test` 脚本；新实现阶段按锁文件恢复依赖后，运行 `bun run compile`、`bun run build:chrome`，检查实际 Chrome MV3 产物。
- 现有 `tests/duckduckgo-parser.test.ts` 使用 `node:test`。新纯逻辑测试沿用这一风格；在支持直接 TypeScript 的 Node 环境运行 `node --experimental-strip-types --test tests/*.test.ts`，记录 Node 版本。DOM／浏览器 API 不冒充纯 Node 已覆盖。
- 添加 transport 测试：UTF-8 跨 chunk、CRLF、多行 data、非 JSON／错误响应、401／403、断流无终态、重连快照替换、写操作不自动重试。
- 添加 controller／repository 测试：同 requestId 去重、未终态恢复、作用域切换、会话占用、事务失败及缓存消息不重复；数据库升级另用真实 Chrome 从 v5 数据验证，不靠空库构建通过替代。
- 添加快照与凭据测试：URL 脱敏、hash 来源区分、空选区、字符上限、预览与发送相同、导出和恶意导入文件不能带入凭据。
- 在 Chrome 中加载构建产物，测试登录页正文、选区、PDF 拒绝、受限页、导航竞争、关开侧边栏、多端审批和普通聊天回归。E2E 工具可以用于开发验证，不要求扩展运行时增加 Playwright 或 debugger 权限。

本文为文档改动，未执行上述构建或运行验收；这些是后续代码交付的验证要求。

## 13. 验收标准

| 场景 | 预期结果 |
| --- | --- |
| 启动服务 | 无独立 Bridge 应用，接入模块随 QwenPaw 加载 |
| 发布基线 | 前端 v1.5.88、后端 2.2.2.post1 的固定提交，不依赖开发版接口 |
| 无本地模型配置 | 远程页面与设置可用，不要求 Ollama 或 selectedModel |
| 远程页面初始化 | 不恢复本地 copilot 历史，不注入默认 Prompt，不自动提交后台消息 |
| 本地／远程切换 | selectedModel 和本地配置不被覆盖，两类历史不混用 |
| 本地动作隔离 | 再生成、编辑、分支、工具、队列和临时聊天不会误操作远程会话 |
| Dexie v5 → v6 | 原数据保留，远程独立表可用，普通历史恢复正常 |
| 备份与导入 | 新凭据不被全量导出，导入文件也不能恢复或注入凭据 |
| 受限凭据访问 | 只能访问授权接入功能，不能调用终端、配置等管理 API |
| 凭据撤销 | 后续请求和审批决定被拒绝 |
| 读取登录后文章 | 使用浏览器当前 DOM，不由服务器重抓替代 |
| 默认与取消分享 | 不自动采集上传，取消后不继续发送 |
| 预览后发送 | 实际内容与确认快照一致 |
| 正文超过 30,000 字符 | 改用选区或明确确认截断，不静默处理 |
| 受限页面与提取失败 | 明确错误，不上传空内容或完整 HTML 冒充成功 |
| PDF／视频网站额外抓取 | 快照不触发 PDF 下载、字幕请求或其他隐式扩展处理 |
| 选区菜单 | 远程模式只生成待确认草稿／快照，不直接发送 |
| 标签页切换与页面变化 | 不自动上传、不切换聊天；提示刷新过期快照 |
| Agent A / B | 路由和可区分记忆对应所选 Agent |
| 连续追问 | 复用原生会话，不重复追加完整历史 |
| 新聊天 | 不继承旧短期对话，按配置复用长期记忆 |
| 不同用户与 App | 无法访问对方会话、请求和审批；长期记忆隔离另按部署核实 |
| 切换 Agent | 不隐式转移历史 |
| 禁用 Agent 或撤销权限 | 请求被拒绝，不回退默认 Agent |
| 重复附件 | 只在确认接收成功后省略重发 |
| 双击发送或完成后重试 | 同 requestId 不启动第二次执行 |
| 同 ID 不同负载 | 返回冲突，不复用旧结果 |
| 同会话并发提交 | 拒绝或返回明确占用状态，不静默丢弃新问题 |
| 关闭输出流 | 原生后台任务按其生命周期运行，不误报已取消 |
| 输出流错误 | 不以流结束当成功，查询权威状态 |
| 断线恢复 | 对账请求、消息和审批，不重复拼接或重发任务 |
| SSE 网络分片 | 跨 UTF-8、JSON 分片和 CRLF 均正确解析，不以 EOF 当成功 |
| 关闭重开侧边栏 | 运行不依赖 service worker 保活，重开查询状态而非重发 |
| 结果摘要被截断 | 不当成完整回答，以原生历史或明确提示处理 |
| 执行结果无法确认 | 显示未知，不自动重跑 |
| 网页或模型伪造审批 | 不生成可操作审批卡片 |
| 原生审批 | 展示可信详情和实际授权范围 |
| 精确目标批准 | 沿用 QwenPaw 行为，不误标为“仅允许本次” |
| 泛化目标批准 | 仅在支持且允许时展示，明确更广范围 |
| 拒绝、过期或无响应 | 遵循原生失败关闭行为，不执行被拒绝操作 |
| 批准后继续 | 原任务继续，不重新提交问题或命令 |
| 无审批权限 | 无法查询或处理未授权审批 |
| 多端竞争与重复决定 | 以原生裁决为准，不伪造重复成功 |
| 审批详情或归属不足 | 禁用操作，引导可信 Console |
| 事件缺口 | 重新查询状态，旧按钮不能继续使用 |
| 宿主重启 | 中断／未知状态可见，不恢复旧审批 Future，不自动重放执行 |
| 模块更新／停用 | 排空后重启，资源释放和中断限制明确，不依赖开发版热重载 |
| 普通 Page Assist 模式 | 原模型聊天与网页能力保持原行为 |

## 14. 后续演进

第一版稳定后再评估：

1. 更多后端 Agent 的能力协商与验证。
2. 基于 QwenPaw Hub 的多用户部署与记忆隔离。
3. 更完整的历史展示、工具活动和事件恢复。
4. 用户确认的跨 Agent 摘要转交。
5. 多标签页显式分享。
6. 受控的“保存为记忆”操作。
7. 独立权限下的浏览器自动化。

只有出现多平台统一接入、独立扩缩容或进程隔离需求时，才重新评估独立网关。当前不为此保留第二个 Bridge 应用。

## 15. 源码依据与版本约束

开发基线为[官方稳定 Release v2.2.2.post1](https://github.com/agentscope-ai/QwenPaw/releases/tag/v2.2.2.post1)，官方标记为非草稿、非预发布，发布于 2026-10-22。已通过 Git 对象只读核对发布提交，未切换本地工作分支；以下源码链接固定完整提交，尚未验证部署运行效果：

| 源码 | 用途 |
| --- | --- |
| [版本号](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/__version__.py) | `2.2.2.post1` |
| [PawApp](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/app.py) / [PawAppContext](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/context.py) | 路由注册、聊天、会话和历史 |
| [PluginApi](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/plugins/api.py) | 路由与生命周期钩子 |
| [TaskTracker](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/task_tracker.py) / [Console 使用方式](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/routers/console.py) | 后台运行、订阅和存活运行的缓存重放 |
| [Workspace](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/workspace/workspace.py) | 原生运行与其他后端分流 |
| [App 身份依赖](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/deps.py) | 认证主体绑定，区分严格入口和旧兼容入口 |
| [普通实例认证](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/auth.py) / [Hub 认证](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/hub/auth.py) | 单账户和后续多用户部署边界 |
| [审批服务](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/approvals/service.py) / [Console 审批路由](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/routers/approval.py) | 原生待审批、身份与决定 |
| [审批范围](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/security/tool_guard/approval.py) / [治理适配](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/governance/tool_adapter.py) | 沿用 exact / similar 等原生语义 |
| [记忆后端接口](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/agents/memory/base_memory_manager.py) / [ReMe 集成](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/agents/memory/reme_light_memory_manager.py) | 工作区记忆与自动记忆边界 |
| [PawApp 集成测试](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/tests/integration/test_pawapp_context_module.py) / [审批路由测试](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/tests/integration/test_approval_router.py) | 实施时参考并运行，不将测试文件存在视为已验收 |

稳定版与上一版设计所参考的开发分支存在实际接口差异：没有新版 `qwenpaw.plugins.apps`、`plugins.sdk`、`plugins.events`，也没有其聚合任务快照和资源托管能力。本版以稳定版既有模块重新划分适配边界，这些开发分支能力不作为实施前提。

### 15.1 Page Assist 发布基线与源码

[官方 Release v1.5.88](https://github.com/n4ze3m/page-assist/releases/tag/v1.5.88) 发布于 2026-10-18，标记为非草稿、非预发布；标签解析为 `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`。本地工作树与发布版仅 README 不同；本次未切换、修改 Page Assist 工作树，也未构建或运行扩展。

| 固定发布提交的源码 | 核对内容 |
| --- | --- |
| [WXT 配置](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/wxt.config.ts) / [package.json](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/package.json) | manifest 版本、Chrome 权限、Bun 构建与类型检查脚本 |
| [侧边栏 App](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/entries/sidepanel/App.tsx) / [Chrome 路由](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/routes/chrome.tsx) | 新页面挂载边界 |
| [本地侧边栏聊天页](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/routes/sidepanel-chat.tsx) / [发送 hook](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/useMessage.tsx) | 自动恢复、Prompt、后台消息与模式分流 |
| [表单](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Sidepanel/Chat/form.tsx) / [空态](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Sidepanel/Chat/empty.tsx) | 模型校验、队列、工具与 Ollama 依赖 |
| [共享消息组件](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Common/Playground/Message.tsx) | 展示复用及动作可见性 |
| [页面采集](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/libs/get-html.ts) / [正文提取](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/parser/default.ts) | DOM 注入、额外抓取、Defuddle 和失败边界 |
| [Tab 聊天链](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/chat-modes/tabChatMode.ts) / [网页问答链](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/chain/chat-with-website.ts) | 为什么不能直接替换模型接入 Agent |
| [Dexie schema](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/db/dexie/schema.ts) / [类型](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/db/dexie/types.ts) | 版本 5、现有本地历史结构 |
| [普通历史 Sidebar](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Option/Sidebar.tsx) | 模型／Prompt 恢复与本地删除语义 |
| [扩展后台](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/entries/background.ts) / [后台消息 hook](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/useBackgroundMessage.tsx) | 选区入口与自动发送隔离 |
| [导入导出](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/libs/export-import.ts) / [已有测试](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/tests/duckduckgo-parser.test.ts) | 凭据排除与 node:test 先例 |

### 15.2 其他参考与升级要求

- [Page Assist 项目](https://github.com/n4ze3m/page-assist)与 [MIT 许可](https://github.com/n4ze3m/page-assist/blob/main/LICENCE)。
- [WXT](https://github.com/wxt-dev/wxt)。
- [QwenPaw 项目](https://github.com/agentscope-ai/QwenPaw)与[文档](https://qwenpaw.agentscope.io/docs/)。

仅在正式稳定 Release 之间升级，并重新验证 PawApp、身份传递、任务记录、审批和关闭流程。本文新增协议和模块账本是本项目待实现内容，不代表稳定版上游已实现。

## 16. 修订记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-10-22 | OpenClaw 网页上下文、会话、记忆与独立 Bridge 初始方案 |
| v1.1 | 2026-10-22 | 将 OpenClaw 原生执行审批纳入第一版 |
| v2.0 | 2026-10-23 | 替换为 QwenPaw；Bridge 改为进程内接入模块；复用 PawApp、原生任务、会话、记忆和审批；取消强制一次性批准要求；重写接口、部署、恢复和验收 |
| v2.1 | 2026-10-23 | 固定正式稳定版 v2.2.2.post1；重新核对发布源码；移除新版插件 SDK、事件总线和热重载依赖，改用稳定版 PawApp、TaskTracker、ApprovalService 与集中适配层 |
| v2.2 | 2026-10-23 | 固定 Page Assist 正式版 v1.5.88；细化独立远程路由、组件复用、快照采集、Dexie v6、传输恢复、凭据备份排除、文件级改动和前端验证 |
