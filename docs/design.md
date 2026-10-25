# Design for Integrating Page Assist with a Remote QwenPaw Agent
[简体中文](design.zh-CN.md) | English

> Implementation note (2026-10-24): this document retains the broader design
> proposal. The implemented first release uses the independently versioned
> [`qwenpaw-channel-page-assist`](https://github.com/refeved/qwenpaw-channel-page-assist)
> channel repository with pip-installed QwenPaw, not a PawApp or a host-core
> modification. The
> [basic channel profile](../contracts/README.md#first-release-basic-channel-profile)
> and [current architecture](architecture.md) take precedence for deployment,
> repository ownership, and supported capabilities.
>
> v0.1.0 (2026-10-25): QwenPaw uses `v2.2.2.post1`, while Page Assist and the
> plugin use `remote-agent-preview-1`. This is the first runnable preview and does
> not mean the full design has passed runtime acceptance.
>
> The browser UI names this provider **Remote Agent**; QwenPaw is its first backend.
> Historical "QwenPaw mode" references below mean that provider. The preview reuses
> the native header/composer layout and `provider-capabilities.ts` capability gating
> without mounting the local message controller.

| Item | Details |
| --- | --- |
| Document version | v2.2 |
| Date | 2026-10-23 |
| Status | Design proposal; the v0.1.0 preview is implemented, while the full design still needs runtime acceptance |
| Target platform | Google Chrome, Manifest V3 |
| Frontend foundation | Lightweight Page Assist fork |
| Frontend development baseline | Upstream Official Release `v1.5.88`, 2026-10-18; commit `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`; integration tag `remote-agent-preview-1`, commit `c9eddc0d236bc58944bb0613ec317dd12d548bf1` |
| Server foundation | QwenPaw stable native Agent, PawApp, and PluginApi |
| Deployment | Integration module runs inside the QwenPaw process; no separately deployed Bridge |
| Core capabilities | Web-page context sharing, Agent selection, memory-aware chat, native tool approval |
| Development and deployment baseline | Official stable Release `v2.2.2.post1`, released 2026-10-22; commit `b6715daabaa4f966626317452980fb84b8be9ab9` |

Pin QwenPaw to `qwenpaw==2.2.2.post1` or the commit above. Page Assist uses fork tag
`remote-agent-preview-1` (commit `c9eddc0d236bc58944bb0613ec317dd12d548bf1`), whose upstream
baseline is `v1.5.88` and its `bun.lockb`. v0.1.0 intentionally uses this preview tag;
otherwise do not use prereleases, development branches, or a floating `latest`. QwenPaw
was selected from an official Release with `draft: false` and `prerelease: false`; any
later stable-version upgrade must be separately verified and the baseline updated.

This version replaces the v1.1 OpenClaw proposal. To preserve existing repository links, the project directory temporarily retains the historical name `page-assist-openclaw`; this does not mean OpenClaw still needs to be deployed.

## 1. Goals and Design Principles

Reuse Page Assist's web-page reading and chat experience in the Chrome side panel, sending only web context explicitly selected by the user to a specified Agent on remote QwenPaw. The Agent answers using its native conversation, workspace memory, and tool policies.

Core responsibilities:

- **Page Assist:** Current-page capture, snapshot preview, Agent selection, input, result display, and human-approval UI.
- **QwenPaw integration module:** Browser access permissions, Agent allowlist, conversation binding, context packaging, request records, event filtering, and frontend protocol adaptation.
- **QwenPaw native service:** Agent execution, conversation history, memory, background tasks, approvals, tool governance, and execution.

The integration module is an in-process QwenPaw feature, preferably implemented as a PawApp backend plugin. It does not start a second web service, call its own management APIs over local HTTP, or run another Agent.

Design principles:

1. Prefer the public plugin SDK and existing host services; avoid duplicating the conversation, task, memory, and approval systems.
2. The browser is a new interaction entry point, not the authority that decides tool permissions.
3. Follow QwenPaw's existing approval flow and authorization semantics. Do not change core approval logic or require compatibility with the old proposal's `allow_once`.
4. The integration module retains access-control and request-recovery responsibilities, but does not expand the Agent's existing tool permissions.
5. Do not copy memory to the browser, introduce a client-side vector store, or resend the full remote history.
6. Treat native-service state and persisted records as authoritative. Show “unknown” explicitly when a result cannot be confirmed; never automatically resubmit a task that may have executed.

“Memory-aware” means the request enters the selected Agent's normal execution path; it does not guarantee that every answer retrieves all memories.

## 2. Initial Scope

### 2.1 Included

- A native Chrome side panel and one remote QwenPaw service connection.
- Listing and selection of Agents subject to server-side authorization.
- Three modes: current-page body, selected text, or no attached page.
- Snapshot preview, refresh, size indication, and explicit sharing.
- Streaming answers and follow-up questions in the same conversation.
- Conversation-ownership checks across Agents, users, Apps, and chats.
- Reuse of the selected Agent's existing memory and tool policies.
- Display of native pending approvals, approve/reject actions, and authorization-scope selection supported by the target version.
- Request lookup after disconnection, pending-approval reconciliation, and multi-client status updates.
- Explicit failure, cancellation-requested, unknown-result, and recovery-unavailable states.

The first release only promises verified native `qwenpaw` backend Agents. Other backends must be validated individually for their capabilities; they are not enabled by default merely because they appear in Agent configuration.

### 2.2 Excluded

- Browser automation such as clicking, typing, or submitting forms.
- Automatic capture across multiple tabs, screenshots, OCR, complex PDFs, or cross-origin iframes.
- Client-side RAG, an independent Agent loop, or a second memory service.
- Automatic “save to long-term memory” and full cross-device history synchronization.
- Automatic handoff of chats across Agents.
- A new approval engine, changes to governance-rule generation, or new “approve once” semantics.
- Bypassing native approvals, sandboxing, or execution-side restrictions.
- Handling external authentication such as OAuth or system privilege elevation inside the extension.
- Full multi-tenant management for ordinary single-account instances.
- Automatically resuming interrupted tasks after process restart or promising exactly-once tool execution.

Reading the current web page does not depend on CDP, Playwright, or `chrome.debugger`. QwenPaw may have other browser tools on the server; their existence does not grant the extension local browser-control permission.

## 3. Target User Experience

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

Basic flow:

1. Configure the QwenPaw integration address and browser-specific credentials.
2. Retrieve Agents that are authorized and meet the capability requirements.
3. Create a chat permanently bound to the selected Agent.
4. The user chooses whether to share the page and previews the exact snapshot to be sent.
5. Submit one new message and subscribe to that request's output.
6. If approval is needed, show a trusted native approval and explain its actual scope.
7. Wait for the native service to process the decision and continue execution; do not resubmit the user's message.
8. Use the same remote conversation for follow-up questions.

Page sharing is off by default. Switching tabs does not upload content, switch chats, or automatically refresh an already confirmed snapshot.

Approval cards show the tool, owning Agent/conversation, operation target supplied by the server, risk explanation, expiry, and authorization scope. If native approval may remember an exact target within the current conversation, state that explicitly; do not label it “allow this time only.” If the target version supports generalized authorization, show its matching scope and impact. Integration policy may expose only a subset of the native options.

Ordinary chat clarification remains a chat response. External authentication directs the user to a trusted entry point; it is not disguised as a generic approval button.

## 4. Overall Architecture and Module Boundaries

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

### 4.1 Technology Choices

| Layer | Choice | Notes |
| --- | --- | --- |
| Extension project | WXT, React, TypeScript from Page Assist v1.5.88 | Pin the release commit and lockfile; retain ordinary model mode |
| Page reading | Existing capture mechanism and Defuddle / Markdown extractor | Read the current DOM; do not replace it with a server-side refetch |
| Extension standard | Manifest V3, Side Panel API | Request page access as needed |
| Server module | Python, stable `qwenpaw.pawapp`, and PluginApi | Reuse the host web service and lifecycle |
| Transport | HTTPS + SSE requests that can carry authentication headers | Separate output subscriptions from approval-event logic |
| Native calls | PawAppContext, ChatManager, TaskTracker, ApprovalService | Call through a centralized adapter; do not use the development-version aggregate SDK |
| Module state | Reuse host persistence and add a module request ledger | Do not assume a separate SQLite service is needed |
| Execution and memory | Native configuration of the target Agent | Do not create a new workspace or replace the memory backend |

The stable version has App storage based on SafeJSONSession, but it is not a transactional request ledger. Request acceptance, payload-conflict checks, conversation locking, and state persistence must be performed under explicit concurrency control. If existing capabilities are insufficient, use the host's existing transactional store or a module-local transactional store. The mere existence of a storage API is not evidence of atomic idempotency.

The first release is designed for a single QwenPaw execution process. Shared locks, events, and in-memory approval state across multiple workers are not promised.

### 4.2 Reuse Priorities

1. Use stable `qwenpaw.pawapp` `PawApp` and `PawAppContext`; register module routes with `include_router()` and follow the PluginApi loading flow.
2. Reuse ChatManager, TaskTracker, and ApprovalService. TaskTracker wraps and dispatches the native chat generator for execution output.
3. Add browser-specific protocol, authorization, snapshots, and request records in the module.
4. The stable release does not have `qwenpaw.plugins.apps`, the newer AppContext aggregate task/approval interfaces, or the SDK event bus. Integrate required host services through a centralized adapter pinned to the stable version; do not port the newer SDK from a development branch. If an interface is insufficient, narrow the scope first or direct the user to Console.

Do not implement the integration module as an Agent-callable Skill or tool. Web routes, credential validation, and human approval entry points must not be directly authorized by web-page scripts or Agent tools.

### 4.3 Tradeoffs of In-Process Deployment

Benefits include one fewer service and protocol-conversion layer, and direct association with native conversations, tasks, and approvals. The cost is a shared failure domain and upgrade cycle with QwenPaw; an in-process plugin is not process-level isolation.

Reuse stable startup/shutdown hooks and explicitly track module background tasks, subscriptions, connections, and storage shutdown. Do not assume development-version resource management or safe hot-reload mechanisms exist. For the first release, drain running tasks and restart the service to update the module; do not provide runtime hot reload. Interrupted tasks are not automatically re-executed.

## 5. Page Assist Changes

### 5.1 Reuse and Additions

| Capability | Handling |
| --- | --- |
| Side panel, theme, Markdown display | Reuse |
| Body and text-selection extraction | Reuse |
| Local chat list and cache | Add remote binding and recovery state |
| Ordinary model providers | Preserve existing behavior |
| Remote Agent provider | Add a separate transport branch; QwenPaw is the first backend |
| Agent selection and context card | Add |
| Approval display and event recovery | Adapt to QwenPaw native semantics |

In Remote Agent mode:

- Replace “model selection” with authorized Agent selection; do not override underlying model or tool configuration.
- Do not call Page Assist local Agents, MCP, or local memory.
- Do not inject a global Prompt such as “answer only from the web page” by default.
- Submit only the current new message and newly added snapshot; do not repeatedly upload the full history.
- Only trusted server-side approval data may generate action cards.

### 5.2 Bypass the Existing Web Q&A Chain

Ordinary Page Assist web chat may make multiple model calls for retrieval, question rewriting, and the final answer. Remote Agent mode must not simply replace the model in this chain: internal rewriting tasks could trigger multiple Agent executions and pollute history.

```text
用户问题 + 已确认快照
    → 一次接入请求
    → 指定原生 Agent 运行
    → 输出与状态展示
```

### 5.3 Findings from Reviewing v1.5.88 Source

A separate local Page Assist checkout was analyzed read-only. Its working-tree commit is newer than the release tag, but the only difference from the release commit is README. The following code findings apply to the pinned release commit and do not use the `main` branch as the implementation basis.

| Verified entry point | Current behavior | Impact on this proposal |
| --- | --- | --- |
| `src/entries/sidepanel/App.tsx` | Mounts MemoryRouter, theme, i18n, React Query, and PageAssistProvider | Retain outer infrastructure and add a remote page; do not create another extension |
| `src/routes/chrome.tsx` → `src/routes/sidepanel-chat.tsx` | Side-panel `/` opens local chat; restores recent copilot history, loads the default Prompt, handles background messages, and auto-submits | Merely replacing the model selector is insufficient; remote mode must avoid these automatic behaviors |
| `src/components/Sidepanel/Chat/{header,form,body,empty}.tsx` | Calls `useMessage()` directly in multiple places; form validates selectedModel, queue, and variable substitutions; empty state queries Ollama | Do not mount these local containers unchanged; do not require users to configure Ollama first |
| `src/hooks/useMessage.tsx` | Actual side-panel send entry point; branches into ordinary chat, web, image, Page Action, WebMCP, etc., and supports edit/regenerate/branch | QwenPaw must not enter this hook's send or local-history mutation paths |
| `src/hooks/useMessageOption.tsx` | Web UI uses a different send chain | The first release supports only remote side-panel mode; do not also refactor the Web UI |
| `src/libs/get-html.ts` | Injection function reads full outerHTML, then runs site parsing, PDF download, or YouTube transcript branches | Reuse only the injection/extraction approach; it is not directly suitable as a restricted snapshot API |
| `src/parser/default.ts` | Converts with Defuddle to Markdown; on failure cleans the DOM and tries Markdown again, and may ultimately return an empty string | Reuse conversion; the remote wrapper must report empty results and exceptions explicitly and must not send raw HTML |
| `src/db/dexie/schema.ts` | PageAssistDatabase already has versions 1–5 | Add remote tables in version 6 without changing old schema definitions |
| `src/libs/export-import.ts` | Full export may read all of storage.local and storage.sync | Add new credentials to export/import exclusion rules; using local alone is not sufficient to prevent disclosure |
| `wxt.config.ts` | Chrome declares broad HTTP, HTTPS, and file `host_permissions`; `manifest.version` is 1.5.88 | Do not claim the existing site permissions are minimal; distinguish fork permissions from remote-mode authorization |

The release version is determined by the tag and `wxt.config.ts` manifest, **not** by the project version still set to `1.0.9` in `package.json`. Preserve Page Assist's MIT copyright and license notices.

### 5.4 Page Organization and State Isolation

Use a separate route and page container. Do not put remote mode in `chatMode: normal | rag | vision`, and do not register an Agent as a model provider.

- Add `/qwenpaw` and `/settings/qwenpaw` in `src/routes/chrome.tsx`.
- Change the side-panel root to a lightweight mode-selection/recovery entry that opens the existing local chat or QwenPaw page according to the user's locally saved choice. The initial default remains ordinary mode.
- Add a remote page container and dedicated `useQwenPawChat` controller. The ordinary page continues to use `useMessage`; the remote page does not mount local header/form/empty components, avoiding hidden Ollama queries, automatic prompts, or background auto-sends.
- Continue reusing outer theme, language, QueryClient, and layout styles. Prefer reusing `PlaygroundMessage`/Markdown for message display, passing converted display DTOs; do not reuse the local send container.
- Store remote connection, Agent, `conversationId`, `requestId`, snapshots, and approval state independently. Do not reuse `selectedModel`, local `historyId`, or the local RAG store.
- Manage messages, approvals, and request state through one page-level controller. Display components receive data through props, avoiding duplicate notifications or submissions from multiple hook instances.

Switching back to local mode does not modify the existing `selectedModel` or local chat configuration. Entering a remote chat only restores cache and queries status; it does not trigger the original recent-chat loading logic or send history.

### 5.5 UI Reuse, Controls, and Background Entry Points

Add `src/components/Sidepanel/QwenPaw/`, organized as appropriate into connection/Agent, snapshot card, message, input, and approval areas. Do not duplicate the entire local form.

Remote-mode control policy:

| Existing control/behavior | Remote mode |
| --- | --- |
| Model selection, model parameters, system Prompt | Use service and Agent selection; do not override native configuration |
| Web RAG, embedding, knowledge base, client memory | Do not display or initialize |
| Page Action, WebMCP, local MCP approval | Do not display; do not treat local `pendingMcpApproval` as remote approval |
| Images, drag-and-drop files, OCR, multi-tab `@tab` | Disabled in the first release; clearly notify on paste/drop rather than silently ignoring attachments |
| Automatic message queue | Not used in the first release; block the next send while running or awaiting approval |
| Edit, regenerate, continue, chat branching | Disabled; these local actions mutate history or invoke a model again and are not equivalent to remote operations |
| Clear context | Replace with explicit creation of a new remote chat; do not imply it erases content already received remotely |
| Temporary chat | No “do not retain” button in the first release; explain that remote conversations are retained according to QwenPaw policy |
| Ordinary Stop button | Do not reuse local abort-as-cancellation semantics; in the first release, only stop display/reconnect or hide the cancel button |
| Copy, Markdown, scrolling, theme, and language | Reuse existing display capabilities |

`PlaygroundMessage` already has display options such as `hideEditAndRegenerate` and `hideContinue`. The remote container should hide unsupported actions and add visibility controls if needed; leaving a visible button with an empty callback is not sufficient. Remote tool information is display-only and must not be connected to the local tool executor.

The selection menu in `background.ts` sends messages such as summary/translate, which `sidepanel-chat.tsx` may automatically submit; YouTube messages also take an automatic branch. Therefore:

- The remote page does not inherit that auto-submit effect or reuse the default summary/translation templates.
- In the first release, provide a separate “Attach selected text” action, or turn existing selection messages into a **draft/snapshot requiring confirmation**, submitted only after the user previews and clicks Send.
- If the extension background receives a remote-mode-specific selection event, include `tabId`, source URL, title, capture time, and type. Validate its association with the extension entry point and current tab; do not treat arbitrary runtime messages as user confirmation.
- Preserve the existing context-menu behavior in ordinary mode. Do not expose remote-service requests or approval decisions through generic message RPCs callable by content scripts.

### 5.6 Dedicated Page Snapshot Adapter

Add `src/libs/qwenpaw/page-context.ts`; reuse `defaultExtractContent()` but do not directly call the multi-site processing chain in `getContentFromCurrentTab()`.

Capture sequence:

1. After the user clicks Read/Refresh, query the active tab from the side panel and pin its `tabId` and candidate URL first.
2. Support only top-level HTTP/HTTPS HTML. Explicitly report PDFs, browser-internal pages, extension pages, and pages that cannot be injected as unsupported; do not trigger downloads, transcript retrieval, or external model processing.
3. Use `scripting.executeScript` in an isolated environment to read the page's actual URL, title, `contentType`, body DOM, or `window.getSelection()`; capture only the main frame and do not read form `.value`, cookies, or storage.
4. In body mode, serialize a cloned DOM after removing nodes that should not be shared, such as script/style, form inputs, and editable areas; run the existing body converter in the extension. Do not modify the page's original DOM. HTML is only temporary local input and is not written to requests, logs, or long-term cache.
5. Check navigation races using the actual URL returned at injection time; discard the result if the tab has changed or its type is unsupported.
6. Sanitize the source URL, detect empty body content, enforce the character limit, explicitly mark truncation, compute the hash, and create an immutable pending-share snapshot.
7. Reuse the same object for preview and sending. Check the target tab/URL again before sending; if changed, require confirmation again rather than silently recapturing. If freshness of dynamic content cannot be determined, prompt for refresh.

Selection mode returns only the selected text, not the whole page. `selectionText` supplied by a separate context menu also becomes a snapshot requiring confirmation first. Event listeners may mark a snapshot stale, but must not trigger automatic capture or upload.

Some exception paths in existing `getDataFromCurrentTab()` do not guarantee explicit completion. The new wrapper uses rejectable async calls, timeouts, and type validation; it does not disguise null values, missing injection results, or permission errors as success. Leave the existing ordinary-mode function unchanged.

### 5.7 Configuration and Local Database

Store connection configuration using an explicit `Storage({ area: "local" })` or equivalent host wrapper; do not copy the default Storage instance and assume it will not sync. Store credentials under a dedicated local-only key, not in Dexie remote tables, ordinary model configuration, or React Query keys.

Add Dexie **version 6**, preserving versions 1–5 and all existing table data. Three tables are recommended:

| New table | Key and required fields | Purpose |
| --- | --- | --- |
| `qwenpawConversations` | Local id, `connectionId`, `principalScope`, `agentId`, `conversationId`, title, `updatedAt` | Fixed remote binding and separate chat list |
| `qwenpawRequests` | `[connectionId+requestId]`, `conversationLocalId`, normalized payload/digest, submission state, remote state, `updatedAt` | Recovery after refresh and duplicate-submission protection |
| `qwenpawMessages` | Local id, `conversationLocalId`, `requestId`, `remoteMessageId`, role, content, display state, `updatedAt` | Streaming display cache and reconstruction |

Create indexes as query needs require; do not mechanically index every field above. If a conversation-creation response arrives but local persistence fails, show a recovery error and do not automatically create a second remote conversation. Before sending, record the request ID, actual payload, and display placeholder in the same transaction; persist first, then start network activity. On recovery, reconnect/query only—do not automatically resend.

Store web-page body text only in necessary recovery records after explicit sharing, and clean it up according to a retention period. Unsent snapshots remain in memory by default. Throttle persistence of message deltas and persist terminal states immediately; when rebuilding a snapshot, replace by remote message ID/request ID rather than appending a second answer.

The first release uses a separate remote chat list and does not write remote bindings into ordinary `chatHistories.model_id`. Existing `Sidebar.tsx` restores models and prompts, and legacy assistant edit/delete operations have local semantics, so it must not load remote tables. Ordinary automatic history restoration, Web UI, and import/export continue to process only existing local records.

“Remove local cache” in the remote list is not equivalent to deleting the server conversation. The first release has no remote-delete feature and must not imply that native history was cleared. When credentials change, detach cached data for the old connection from the current identity; restore only after reauthentication and reconciliation. A cache hit is not authorization.

### 5.8 Request Transport and Recovery Controller

Centralize types, client, and stream parsing under `src/services/qwenpaw/`; the page hook should only orchestrate UI:

- Construct URLs relative to the configured service address and call only the fixed `/api/page-assist` paths. Production remote access requires HTTPS; do not accept service redirects supplied by web pages or models.
- The client adds authentication headers and validates HTTP status and response shape. Display 401/403, conflict, rate-limit, and service errors separately; do not fall back to an ordinary model.
- Streaming fetch uses TextDecoder while retaining UTF-8 state across chunks. SSE parsing supports chunk boundaries, CRLF, multiline `data`, heartbeats, and EOF; do not call `JSON.parse` on each network chunk.
- The controller distinguishes submission, running, waiting for approval, disconnected, recovering, terminal, and unknown. Allow only one active request per conversation and keep input locked while approval is pending.
- Allow automatic reconnection of read-only event subscriptions, but never automatically retry write operations such as chat creation, message submission, or approval decisions. Query first when the outcome is unknown. Explicitly retrying a decision uses the same `decisionId` and honors server-side idempotent results.
- Whenever the remote page opens, first load locally nonterminal requests, then query server request status, native-message recovery, and pending approvals. Full history or message snapshots come from the integration protocol; the browser does not access QwenPaw management-history APIs directly.
- Output and approval subscriptions are independent. On page unload or connection switch, release AbortController, listeners, and polling; end only the subscription and do not send a rejection or cancellation to the server.
- In the first release, the visible side-panel page owns the network connection; do not rely on MV3 service-worker lifetime for long-lived connections. Native background tasks continue when the side panel closes and are recovered when it reopens.

Approval cards are separate trusted DTOs, not inferred from Markdown or chat strings. The UI handles native authorization scopes and fallback to trusted Console; it does not change the QwenPaw approval core.

### 5.9 Permissions, Credentials, and Import/Export

v1.5.88 already has broad `host_permissions`, and ordinary model mode depends on arbitrary model servers. The lightweight fork retains existing permissions in the first release for compatibility; do not claim the entire extension has minimal site permissions. QwenPaw transport is still restricted to the configured service origin and message entry points. Migrating all extension permissions to `optional_host_permissions` requires a separate migration; do not merely remove wildcard permissions and break ordinary model access.

Credential protection must cover actual data paths:

- Review full `storageLocal`/`storageSync` export in `src/libs/export-import.ts`; strip the new credential key and any remote configuration containing credentials before serialization.
- On import, refuse to restore these credential keys and require authentication to be configured again after connection details are imported. Do not trust arbitrary import files merely because export sanitizes data.
- By default, do not add new remote tables in the first release to full backups, public sharing, or ordinary chat export. The UI must state that remote display cache is not included in legacy exports.
- Do not write credentials to default Storage, Content Script, URLs, model configuration, or logs, and do not return raw credentials through background messages.
- Reuse the existing Markdown-safe display boundary; do not enable arbitrary HTML or local tool actions for remote messages.

### 5.10 Proposed File-Level Changes and Delivery Order

The following new paths are implementation suggestions, not claims that they already exist in the source:

| File/area | Change |
| --- | --- |
| `src/routes/chrome.tsx` and side-panel root entry | New route and explicit mode selection; do not change the Web UI send chain |
| New `src/routes/sidepanel-qwenpaw.tsx`, `sidepanel-settings-qwenpaw.tsx` | Separate remote page and connection settings independent of Ollama |
| New `src/components/Sidepanel/QwenPaw/` | Remote controls, snapshots, separate history, and approval display |
| New `src/hooks/useQwenPawChat.ts` | Single page-level state machine and submission/recovery orchestration |
| New `src/services/qwenpaw/` | Fixed application protocol, credential configuration, client, SSE, and DTO validation |
| New `src/libs/qwenpaw/page-context.ts` | Restricted current-page/selection snapshot adapter |
| `src/db/dexie/schema.ts`, `types.ts`, and new remote repository | Version 6, separate tables, transactions, and cache cleanup |
| `src/entries/background.ts` | Required selection-draft entry point; preserve ordinary menu behavior |
| `src/libs/export-import.ts` | Exclude new credentials from export/import |
| Existing shared message components and language resources | Add only necessary action toggles and Chinese/English text |

Prioritize “connection → Agent → chat without web context → follow-up → disconnection recovery,” then “snapshot preview and sharing,” and finally “native approvals.” Keep the ordinary side panel and Web UI working at every step. Avoid first making sweeping changes to the model factory or all of `useMessage`.

## 6. Identity, Agents, and Conversation Model

### 6.1 Authentication and Authorization

The browser uses separate, revocable, restricted client credentials and does not store Console administrator credentials. Prefer reusing host authentication facilities and add necessary integration permission checks; do not create a separate account system.

Credentials may access only the integration module namespace and are restricted to permitted Agent, chat, and approval operations. Authentication must be integrated at the host middleware/route authorization boundary: restricted credentials must neither be rejected prematurely by the host nor allowed to access configuration, terminal, arbitrary files, or other management APIs.

Check chat and approval permissions separately. Credential revocation and Agent permission changes take effect on subsequent requests immediately; hiding a button in the frontend is not a substitute for server-side validation.

Ordinary QwenPaw authentication is designed for a single account and login is disabled by default. Production remote deployment must explicitly enable and initialize authentication; do not rely on default configuration or private-network reachability as authentication.

The first release primarily targets personal instances. For true multi-user deployments, use and verify QwenPaw Hub identity and isolation rather than treating an ordinary instance as a complete multi-tenant service. Conversation isolation does not guarantee per-user isolation of long-term memory for the same Agent; sensitive memories belonging to different users should use isolated Agent workspaces or instances.

### 6.2 Agent Discovery

Obtain candidate Agents from stable Agent configuration and the host Agent-management service, then filter them through a centralized adapter:

- Agents permitted for the current credential.
- Agents that are enabled, available, and meet first-release backend constraints.
- Names, descriptions, and capabilities allowed for display by integration policy.

Do not return workspace absolute paths, model credentials, or full configuration to the browser. The Agent selector is not an authorization boundary; recheck authorization on every message and approval operation, and do not fall back to another Agent.

### 6.3 Conversation Binding

Bind each chat to:

```text
服务实例 + 认证主体 + 接入 App + Agent ID + conversationId
```

The module creates an unguessable `conversationId` and maps it to the native session ID/chat-record ID. Construct an isolated native session using the App namespace, authenticated principal, and fixed channel, and validate ChatSpec ownership. Do not assume the stable release automatically provides the newer SDK's user-hash session namespace. Do not treat `conversationId`, native `session_id`, chat-record ID, and per-request ID as the same identifier.

Client messages specify only `conversationId`; they cannot override user, Agent, native session key, model, or tool configuration through query parameters or request headers.

| Operation | Behavior |
| --- | --- |
| Follow-up in same chat | Reuse the native conversation |
| New chat | Create a new native conversation; the Agent may still use long-term memory |
| Switch Agent | Enter or create a separate chat for that Agent; do not migrate history |
| Switch tab | Keep the chat and update the pending-share page state |
| Switch service | Use a separate chat space and credentials |

If the conversation is archived, deleted, unauthorized, or unavailable natively, report an explicit error; do not silently create a replacement conversation.

### 6.4 Data Ownership

| Location | Data |
| --- | --- |
| Extension | Service configuration, local display cache, `conversationId`, request ID, snapshot metadata |
| Integration module | Permission configuration, native conversation mapping, request ledger, event recovery records, necessary approval-operation audit |
| QwenPaw native service | Authoritative conversation history, workspace memory, actual task and approval state |

The module does not maintain a second complete conversation history. Give recovery and local display caches retention periods; explicitly report when recovery is no longer possible after expiry.

## 7. Web-Page Context

### 7.1 Modes and Snapshots

| Mode | Content |
| --- | --- |
| No attachment | User question only |
| Selection | Selected text, title, sanitized URL |
| Body | Markdown extracted from current DOM, title, sanitized URL |

The following is application data for this proposal, not a native QwenPaw DTO:

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

### 7.2 Capture and Privacy

- Remove URL fragments by default and filter sensitive query parameters.
- Do not read password fields, form input values, cookies, or Local Storage.
- Body content may contain sensitive information; allow preview and cancellation.
- Explicitly report restricted pages or extraction failures; do not silently upload full HTML.
- Extract authenticated-page content from the current DOM; server-side refetching of the URL is not a substitute.

### 7.3 Size, Freshness, and Deduplication

The recommended body limit is **30,000 characters**, not a model-token limit. If exceeded, prompt the user to use a selection or explicitly confirm truncation. Show truncation in the preview; do not silently launch an additional model summarization.

The server separately limits question length, total request body, and model context budget; record the actual values during implementation.

Before sending, check the tab, URL, and snapshot match. If navigation, content change, or freshness is uncertain, prompt for refresh; an unchanged URL alone does not prove that a snapshot is current.

Omit resending only an identical snapshot whose receipt was confirmed in the same remote conversation. If the result is unknown, query the request first; do not mark an attachment as submitted merely because Send was clicked. Treat a changed page as a new attachment. Removing an attachment does not make the native conversation forget content it already received; create a new chat if isolation is needed.

## 8. Native Execution Path and Memory Reuse

### 8.1 Integration Path

```text
已授权 conversationId
    → 解析固定 Agent 和原生会话
    → 校验并封装当前新消息及网页快照
    → TaskTracker 持有 PawAppContext.chat_stream() 生成器
    → Workspace.stream_query()
    → 原生 Runtime、记忆和工具治理
```

Stable PawAppContext already provides capabilities such as `chat_stream()`, conversation creation, and history, and enters `Workspace.stream_query()`. Reuse the host TaskTracker and ApprovalService through an adapter for background tasks and approvals; do not call stable-version-nonexistent `AppContext.start_task()`, `approvals()`, or `for_workspace()`. Do not create a new Agent instance, route Agents through the OpenAI `model` field, or derive conversations from stable `user`.

Calling the streaming chat interface alone does not guarantee continuation after disconnection. Production submission reuses TaskTracker's `attach_or_start()`, `attach()`, and `stream_from_queue()` pattern so the native task owns the chat generator and the browser only subscribes to output. Stable Console already uses this pattern; do not call a Console handler over HTTP. TaskTracker can replay in-memory output for a live run, but is not a persistent cross-process event log. After completion, recover using module terminal records and native history.

### 8.2 Request and Lifecycle

Use a distinct `requestId` for every new message. A native background task may track a run by chat-record identifier; that identifier must not be treated as a permanently unique ID for every message turn.

Allow at most one in-progress message request per conversation; an approval wait continues to occupy that slot. Duplicate submissions reuse the module request record and do not depend on a native `request_id` field to provide idempotency automatically.

Persist acceptance in the module before starting native execution. Reconcile intermediate states if a crash occurs before or after startup; if it is impossible to confirm whether execution began, mark it unknown and do not rerun automatically. The stable TaskTracker does not provide the newer SDK's on-disk task snapshots. The module should record acceptance and terminal state, while native history is responsible for complete messages; do not treat a runtime cache as proof of persisted completion.

### 8.3 Context Packaging

Separate the question and web material into clear sections, retaining title, source, capture time, and truncation status. Web content is untrusted reference data; do not elevate it to a system instruction or let it change model, tool, or approval policies.

An ordinary text message is sufficient to enter the native execution path; core message structure need not be changed. Delimiters only help the model distinguish content and do not replace tool governance.

### 8.4 Memory Preconditions

- The Agent is bound to the correct workspace and native backend.
- The actual memory backend is available; do not assume ReMe is enabled based only on product descriptions.
- Memory retrieval capabilities, indexes, and model configuration are available when needed.
- A new chat can use long-term memory without inheriting another chat's short-term history.
- Memory-sharing boundaries across Agents and users meet deployment requirements.
- Context budget, truncation, and tool policies do not block the required capability.

The client displays only verifiable server-side status and does not fabricate “memory retrieved.”

### 8.5 Writing and Retention

The first release has no save-to-memory button, but native conversation records, memory tools, automatic memory, and background maintenance may still save web material. Use QwenPaw configuration and policy. If long-term memory writes must be prohibited, configure and verify this on the server rather than relying on a frontend toggle or Prompt.

“Do not write long-term memory” does not mean “do not save conversations.” A no-retention mode requires separate verification of conversation, log, backup, and model-provider retention policies.

Existing OpenClaw data is not directly compatible with this protocol. If migration is needed, migrate readable materials and revalidate indexes, sources, and permissions; do not directly reuse old indexes or assume history formats match.

## 9. Integration Module API

The following are all **proposed new browser-application protocol endpoints**, not declarations of existing QwenPaw APIs. The proposed PawApp ID is `page-assist`, with the shared prefix `/api/page-assist`, registered in the same host service.

Stable PawApp capabilities are implementation references, but the browser exposes only module routes wrapped with authorization. Use `get_scoped_ctx` identity constraints; do not use legacy `get_ctx`, which accepts client identity claims, as a remote authorization boundary. Resolve the Agent from the server-side conversation mapping; do not trust a default query parameter. Do not expose generic storage, arbitrary workspace selection, or the full management API.

All endpoints carry an authentication header; the server determines the principal. SSE uses streaming fetch that supports authentication headers; never put credentials in the URL.

### 9.1 Capabilities and Agents

```http
GET /api/page-assist/capabilities
GET /api/page-assist/agents
```

The capabilities response describes the protocol version, context limits, and supported recovery/approval capabilities. It also provides a non-sensitive service-instance identifier and current authentication-scope identifier so the frontend can detect service or credential changes. These identifiers are only for cache partitioning and do not replace server authorization. The Agent response includes only fields needed for display and selection, for example:

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

### 9.2 Create a Conversation

```http
POST /api/page-assist/conversations
```

```json
{
  "agentId": "uwb-researcher"
}
```

The response includes a server-generated `conversationId` and fixed `agentId`. Create a native conversation and save its ownership mapping; do not accept a client-specified owner.

### 9.3 Submit a Message

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

Omit `pageContext` when no web page is attached. On acceptance, return the request identifier and state; the frontend subscribes to output separately. Acceptance does not mean completion.

Server-side validation:

- Authorization and fixed binding among user, conversation, and Agent.
- Ownership of the request ID and normalized payload digest.
- Limits on question, snapshot, hash, and total request body.
- No other in-progress request in the same conversation.
- Reject arbitrary upstream routing headers, native session keys, or model/tool overrides.

The same ID with the same payload returns the existing record; the same ID with a different payload returns a conflict. Retrying after completion must not start a second execution.

### 9.4 Request Queries and Output

```http
GET /api/page-assist/requests/:requestId
GET /api/page-assist/requests/:requestId/events
GET /api/page-assist/conversations/:id/messages
```

| Application state | Meaning |
| --- | --- |
| `accepted` | Recorded, but native execution has not yet been confirmed as started |
| `running` | Native task is running |
| `waiting_approval` | Associated with a pending approval; conversation remains occupied |
| `completed` | Native execution completed and result was confirmed |
| `failed` | Known failure |
| `cancelled` | Native service confirmed it stopped; a broken stream alone is insufficient |
| `unknown` | It may have executed, but this cannot currently be confirmed |

These are integration-protocol states; they do not require changing native task enums. Stable TaskTracker running/idle state is insufficient to determine completion, failure, or whether execution ever occurred. Combine it with module terminal state and native history. Map runs that cannot be verified after host restart to unknown, not “never executed.”

Output events distinguish message deltas, state, errors, and terminal state. Stream termination does not mean success. During recovery, prefer recorded terminal state and native history. If delta replay is unavailable, return a reconstructed message snapshot and explicitly reset display to avoid duplicate concatenation.

For direct frontend implementation, standardize at least the following application events; these are not native QwenPaw event names:

| Event type | Required fields | Frontend action |
| --- | --- | --- |
| `request.state` | requestId, state | Update request state; do not infer execution merely from a live connection |
| `message.delta` | requestId, messageId, delta | Append visible text to the specified assistant message |
| `message.snapshot` | requestId, messageId, content, status | Replace the specified message for reconstruction/recovery |
| `request.error` | requestId, code, message | Display failure or unknown; query later to confirm |
| `request.terminal` | requestId, state | End subscription after reconciling with persisted request state |

The message-history endpoint returns only visible message DTOs in an authorized conversation, including stable message ID, associated requestId, role, content, and status. Do not expose internal model reasoning, credentials, or unnecessary native parameters. Pagination/snapshot results must explicitly define the replacement range; a limited task summary must not be treated as full history.

An initial implementation may send the known message snapshot when a subscription is established, followed by new deltas. On reconnect, abort the old subscription first and replace the snapshot to avoid duplicate appends from cache replay. If native messages lack stable IDs, create persistent mappings in the module. Event sequence identifiers guarantee ordering only within the current subscription and do not promise replay across processes.

### 9.5 Approval List, Events, and Decisions

```http
GET /api/page-assist/approvals
GET /api/page-assist/events
POST /api/page-assist/approvals/:id/decision
```

Pending approvals are separate from chat output. Switching chats or ending an output subscription must not hide pending approvals the user is authorized to handle.

Query native PendingApproval through ApprovalService, reuse approval display helpers, and add the module's conversation association and permitted display operations. Do not depend on the development-version ApprovalSnapshot DTO. The browser protocol may adapt native approval decisions and `scope`, for example:

```json
{
  "decisionId": "client-generated-uuid",
  "approved": true,
  "scope": "exact"
}
```

The native service and integration capability declaration define valid `scope` values and meanings. A rejection uses `approved: false` and grants no scope. Do not redefine the old protocol's `allow_once` in the first release.

The module validates approval permission, trusted ownership, current validity, and supported operations, then calls the native ApprovalService decision entry point through a centralized adapter. Do not treat extension users as Console administrators and call existing management handlers directly. Clients cannot modify commands, targets, Agent, conversation, or approval parameters.

Repeated submissions with the same `decisionId` return the existing processing record; a conflicting decision does not overwrite a confirmed result. If native service reports a conflict, expiry, or missing object, query available state and reconcile. If the result cannot be proven, show unknown rather than fabricate success.

### 9.6 Errors and Cancellation

- Authentication failure: require credential update; do not fall back to anonymous access.
- Disabled or unauthorized Agent: report the error and refresh the list; do not switch to a default Agent.
- Native conversation unavailable: explain recovery options; do not automatically create a new one.
- Rate limit: show retry information; do not automatically repeat a submitted request.
- SSE error or event gap: query state and rebuild the display if needed.
- Approval unavailable: disable the operation and provide a trusted Console entry point.
- Closing the extension or stopping SSE reads: cancel only the subscription; do not claim the remote task stopped.

A cancel button is not required in the first release. If offered, it must call native cancellation and distinguish requested, confirmed-stopped, and timed-out states; interrupting the frontend HTTP request alone is not cancellation.

## 10. Reusing and Recovering Approvals

### 10.1 Principles

Approvals fully reuse QwenPaw's native services, identity checks, tool governance, and execution resumption. Do not implement side-channel approval or change core rule-generation behavior.

Native `exact` means an exact-target scope and does not guarantee one-time use; `similar` means broader target matching. Whether authorization is remembered also depends on native policy and approval source. Reuse Console terminology and explanations in the UI, adding clarification if necessary; do not promise one-time behavior across sources.

When capability is uncertain, ownership cannot be confirmed, operation details are insufficient, or the backend is unsupported, keep chat available and direct approval handling to trusted Console. Do not rewrite the approval system to cover every approval type. Record unsupported approval cases explicitly in capability and acceptance records.

### 10.2 Display and Handling

- Only pending approvals generated by the native service can produce action cards; “please approve” in model text is not an approval.
- Display the actual server-provided tool and target, retaining risk information; do not replace them with a model-generated summary.
- Show only verified authorization options; do not disguise a generalized target as an exact one.
- After clicking, show submission-in-progress; show approved/rejected only after native confirmation.
- Approval does not mean tool execution succeeded and does not bypass sandbox or file permissions.
- The native service resumes the original task; the module does not resubmit the question or execute commands itself.
- Expiry, no response, disconnection, and plugin shutdown do not count as consent.

### 10.3 Disconnection and Process Restart

| Situation | Handling |
| --- | --- |
| Browser disconnects while host is running | Query task and pending approvals; restore actual state within authorization scope |
| Another client handles approval | Reconcile through native approval-state polling and disable stale controls |
| Event gap received | Query again; do not treat missing events as proof that nothing happened |
| Module update or deactivation | Drain tasks and restart service; report unconfirmed tasks as interrupted or unknown; do not promise safe hot reload |
| QwenPaw process restart | Do not assume in-memory native approvals are recoverable; verify task/history and do not reconstruct old Futures or auto-execute |
| Decision submitted but response lost | Query module records and available native state; show unknown if confirmation is impossible |

The stable version has no newer SDK approval event bus. In the first release, generate browser notifications by controlled polling of native pending-approval lists and task state. The module performs only filtering, association, and necessary auditing; it does not add an approval engine. On notification interruption, sequence gaps, or reconnect, reconcile again. An empty pending-approval list does not prove a specific approval was granted.

For approvals such as cross-Agent subtasks whose ownership cannot be reliably verified through the stable adapter, direct the user to Console in the first release; do not support them by relaxing all ownership checks.

## 11. Remote Deployment, Security, and Retention

### 11.1 Recommended Topology

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

No separate Bridge process, port, or Node.js dependency. QwenPaw listens only on localhost or a controlled network interface, with only required paths exposed through an existing TLS entry point. Private networks also require authentication.

Expose only the integration API and necessary authentication paths at the remote entry point. Sharing a port does not justify exposing all Console management functions. If Console needs remote access, use a separate management policy.

### 11.2 Credentials and Browser Boundaries

- Store credentials in extension-controlled storage; do not put them in Content Script, page DOM, URLs, export records, or synchronized storage.
- Use permissions such as `activeTab` and `scripting` as needed for page reading; remote permission covers only the actual service site.
- Do not rely on CORS, Origin, or extension ID as the sole authentication mechanism.
- Keep approval UI in the extension side panel; do not inject it into page DOM.
- Pages, models, and tools cannot trigger the human-approval entry point.
- Preserve safe Markdown rendering; do not execute returned scripts or arbitrary HTML.
- Source Console links from trusted service configuration; do not use management URLs supplied by pages/models or include management credentials.

### 11.3 Logging, Auditing, and Retention

Prefer native logs for audit. The module adds authenticated principal, `conversationId`, `requestId`, native association, approval decision, and confirmation result, with sensitive parameters redacted.

Ordinary access logs must not contain web-page body text, model responses, or authentication headers. Define retention periods for module recovery cache, event cache, local chats, and native conversations.

Stop collecting after the user cancels sharing. Web material may still be retained through native conversations, memory policy, and backups; if a cloud model is used, it may also be sent to the model provider. Prompt injection in a web page does not grant tool permissions or memory-write permissions.

## 12. Implementation Plan

### Phase 1: Pin Baselines and Verify Native Capabilities

Use a non-sensitive test Agent and do not modify Page Assist yet:

1. Pin QwenPaw `v2.2.2.post1` and its commit, Page Assist `v1.5.88` and its commit/lockfile, and record deployment configuration. Do not infer release capabilities from local HEAD.
2. Verify Agent routing, conversation creation, follow-up, and history using stable PawApp/PawAppContext and the centralized adapter.
3. Use distinguishable facts to verify memory and new-chat boundaries across two Agents.
4. Verify native background tasks, output events, and state queries after disconnection.
5. Trigger a real approval, reuse existing approve/reject and authorization scopes, and verify continuation of the original task.
6. Verify actual behavior for expired approvals, multi-client handling, interrupted polling notifications, and host restart.
7. Verify how restricted credentials integrate with host authentication and confirm that they cannot access other management APIs.

Produce a supported-capabilities list and explicit limitations; do not modify core approvals to implement the old proposal's one-time semantics.

### Phase 2: Implement the In-Process Integration Module

Implement plugin registration, permission filtering, Agent list, conversation mapping, context packaging, request ledger, background-task integration, output subscriptions, and state recovery.

Reuse native approval queries and decisions, adding frontend notifications, ownership filtering, operation records, and Console fallback through controlled polling. Verify that draining/shutting down the service leaves no tasks or subscriptions behind. Do not build an additional knowledge base, conversation-history store, or approval engine, and do not port prerelease SDKs.

### Phase 3: Modify Page Assist

Split work along the file-level boundaries in Section 5 into independently verifiable steps:

1. New routes, mode switching, and connection settings; allow entry and connection without Ollama configuration.
2. Version 6 remote tables, restricted configuration, credential filtering in export/import, and separate chat list.
3. Dedicated client/SSE/page controller; enable native conversation without web context, follow-up, and recovery.
4. Body/selection snapshots, navigation-race checks, oversize confirmation, and explicit user sharing.
5. Native approval query/decision, independent notification stream, and Console fallback.
6. Disable unsupported local actions individually and test background auto-send paths and ordinary-mode regressions.

Retain ordinary model mode; do not send internal steps of the existing web Q&A chain to the Agent.

### Phase 4: End-to-End and Regression Testing

Validate the entire path using real Chrome and the target deployment, and record configuration, versions, supported approval types, and recovery boundaries. Update the status to full design acceptance only after passing the acceptance below; source review or the existence of an API is not runtime evidence. The v0.1.0 preview covers only the basic channel path.

Frontend validation uses existing release-project tools; do not introduce a new test framework first:

- The project already has a Bun lockfile and `compile` and `build:chrome` scripts, but no unified `test` script. During implementation, restore dependencies from the lockfile, run `bun run compile` and `bun run build:chrome`, and inspect the actual Chrome MV3 artifact.
- Existing `tests/duckduckgo-parser.test.ts` uses `node:test`. Follow this style for new pure-logic tests; in a Node environment with direct TypeScript support, run `node --experimental-strip-types --test tests/*.test.ts` and record the Node version. Do not claim DOM/browser APIs are covered by pure Node tests.
- Add transport tests: UTF-8 across chunks, CRLF, multiline data, non-JSON/error responses, 401/403, disconnect without terminal state, snapshot replacement on reconnect, and no automatic retry of writes.
- Add controller/repository tests: deduplication for the same requestId, recovery of nonterminal requests, scope switching, conversation locking, transaction failures, and no duplicate cached messages. Validate the database upgrade separately in real Chrome using v5 data; an empty-database build is not a substitute.
- Add snapshot/credential tests: URL redaction, hash-source distinction, empty selection, character limit, identical preview/send content, and credentials excluded from export and malicious import files.
- Load the built artifact in Chrome and test authenticated-page body, selection, PDF rejection, restricted pages, navigation races, closing/reopening the side panel, multi-client approval, and ordinary-chat regression. E2E tools may be used for development validation; do not add Playwright or debugger permissions to the extension runtime.

This document change did not run the above build or runtime acceptance. Those are validation requirements for later code delivery.

## 13. Acceptance Criteria

| Scenario | Expected result |
| --- | --- |
| Start service | No separate Bridge application; integration module loads with QwenPaw |
| Release baseline | Pinned frontend v1.5.88 and backend 2.2.2.post1 commits; no development-version API dependency |
| No local model configuration | Remote page and settings work without Ollama or `selectedModel` |
| Remote page initialization | Does not restore local copilot history, inject a default Prompt, or auto-submit background messages |
| Switch local/remote | `selectedModel` and local configuration are not overwritten; histories are not mixed |
| Local-action isolation | Regenerate, edit, branch, tools, queue, and temporary chat do not mistakenly operate on remote conversations |
| Dexie v5 → v6 | Existing data preserved, separate remote tables work, ordinary history still restores |
| Backup and import | New credentials are not fully exported; imports cannot restore or inject credentials |
| Restricted credential access | Only authorized integration features are accessible; management APIs such as terminal/configuration cannot be called |
| Credential revocation | Subsequent requests and approval decisions are rejected |
| Read an authenticated article | Use current browser DOM; server-side refetch is not a substitute |
| Default and canceled sharing | No automatic capture/upload; stop sending after cancellation |
| Send after preview | Actual content matches the confirmed snapshot |
| Body exceeds 30,000 characters | Use selection or explicitly confirm truncation; do not handle silently |
| Restricted page or extraction failure | Explicit error; do not upload empty content or misrepresent full HTML as success |
| Additional PDF/video-site fetching | Snapshot does not trigger PDF download, subtitle request, or other implicit extension processing |
| Selection menu | Remote mode creates only a draft/snapshot requiring confirmation; it does not send directly |
| Tab switch and page changes | No automatic upload or chat switch; prompt to refresh stale snapshots |
| Agent A / B | Routing and distinguishable memory correspond to the selected Agent |
| Follow-up | Reuse native conversation; do not append the full history again |
| New chat | Does not inherit old short-term conversation; reuses long-term memory according to configuration |
| Different users and Apps | Cannot access others' conversations, requests, or approvals; verify long-term memory isolation separately for deployment |
| Switch Agent | Does not implicitly transfer history |
| Disable Agent or revoke permission | Reject request; do not fall back to a default Agent |
| Duplicate attachment | Omit resend only after receipt is confirmed |
| Double-click Send or retry after completion | Same requestId does not start a second execution |
| Same ID, different payload | Return conflict; do not reuse old result |
| Concurrent submission to same conversation | Reject or return explicit occupied state; do not silently discard a new question |
| Close output stream | Native background task follows its lifecycle; do not falsely report cancellation |
| Output-stream error | Do not treat stream end as success; query authoritative state |
| Recovery after disconnection | Reconcile requests, messages, and approvals without duplicate concatenation or task resubmission |
| SSE network fragmentation | Correctly parse across UTF-8, JSON chunks, and CRLF; EOF is not success |
| Close and reopen side panel | Execution does not depend on service-worker keepalive; query on reopen instead of resending |
| Truncated result summary | Do not treat it as a complete answer; use native history or state the limitation |
| Execution result cannot be confirmed | Show unknown; do not rerun automatically |
| Approval forged by web page or model | Does not create an actionable approval card |
| Native approval | Display trusted details and actual authorization scope |
| Exact-target approval | Follow QwenPaw behavior; do not mislabel as “allow this time only” |
| Generalized-target approval | Display only when supported and allowed; explain its broader scope |
| Rejection, expiry, or no response | Follow native fail-closed behavior; do not execute rejected operation |
| Continue after approval | Original task continues; do not resubmit question or command |
| No approval permission | Cannot query or handle unauthorized approvals |
| Multi-client race or duplicate decision | Native decision is authoritative; do not fabricate duplicate success |
| Insufficient approval details or ownership | Disable action and direct to trusted Console |
| Event gap | Query state again; stale buttons cannot be used |
| Host restart | Interrupted/unknown state is visible; do not restore old approval Future or replay execution automatically |
| Module update/deactivation | Drain and restart; release resources and explain interruption limits; do not depend on development-version hot reload |
| Ordinary Page Assist mode | Existing model chat and web capabilities retain their behavior |

## 14. Future Evolution

Evaluate only after the first release is stable:

1. Capability negotiation and validation for more backend Agents.
2. Multi-user deployment and memory isolation based on QwenPaw Hub.
3. More complete history display, tool activity, and event recovery.
4. User-confirmed summary handoff across Agents.
5. Explicit sharing across multiple tabs.
6. Controlled “save as memory” operation.
7. Browser automation under separate permissions.

Reevaluate a standalone gateway only if unified multi-platform integration, independent scaling, or process isolation is needed. Do not retain a second Bridge application for this proposal.

## 15. Source References and Version Constraints

The development baseline is the [official stable Release v2.2.2.post1](https://github.com/agentscope-ai/QwenPaw/releases/tag/v2.2.2.post1), marked non-draft and non-prerelease and released 2026-10-22. The release commit was verified read-only through Git objects; the local working branch was not switched. The following source links pin the full commit; deployment behavior has not been verified:

| Source | Purpose |
| --- | --- |
| [Version](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/__version__.py) | `2.2.2.post1` |
| [PawApp](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/app.py) / [PawAppContext](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/context.py) | Route registration, chat, conversations, and history |
| [PluginApi](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/plugins/api.py) | Routes and lifecycle hooks |
| [TaskTracker](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/task_tracker.py) / [Console usage](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/routers/console.py) | Background execution, subscriptions, and replay cache for live runs |
| [Workspace](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/workspace/workspace.py) | Native execution and routing to other backends |
| [App identity dependency](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/pawapp/deps.py) | Authenticated-principal binding; distinguishes strict and legacy compatibility entry points |
| [Ordinary-instance auth](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/auth.py) / [Hub auth](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/hub/auth.py) | Single-account and future multi-user deployment boundaries |
| [Approval service](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/approvals/service.py) / [Console approval routes](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/app/routers/approval.py) | Native pending approvals, identity, and decisions |
| [Approval scopes](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/security/tool_guard/approval.py) / [Governance adapter](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/governance/tool_adapter.py) | Preserve native `exact` / `similar` semantics |
| [Memory backend interface](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/agents/memory/base_memory_manager.py) / [ReMe integration](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/src/qwenpaw/agents/memory/reme_light_memory_manager.py) | Workspace memory and automatic-memory boundaries |
| [PawApp integration tests](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/tests/integration/test_pawapp_context_module.py) / [Approval-route tests](https://github.com/agentscope-ai/QwenPaw/blob/b6715daabaa4f966626317452980fb84b8be9ab9/tests/integration/test_approval_router.py) | Reference and run during implementation; test-file existence is not acceptance |

The stable release has actual interface differences from the development branch referenced by the previous design. It does not have newer `qwenpaw.plugins.apps`, `plugins.sdk`, or `plugins.events`, nor its aggregate task snapshots and resource-management capabilities. This version redraws adapter boundaries around existing stable-release modules; those development-branch capabilities are not prerequisites.

### 15.1 Page Assist Release Baseline and Source

[Official Release v1.5.88](https://github.com/n4ze3m/page-assist/releases/tag/v1.5.88) was released 2026-10-18, marked non-draft and non-prerelease; its tag resolves to `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`. The local working tree differs from the release only in README. This work did not switch or modify the Page Assist working tree and did not build or run the extension.

| Source at pinned release commit | Reviewed content |
| --- | --- |
| [WXT config](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/wxt.config.ts) / [package.json](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/package.json) | Manifest version, Chrome permissions, Bun build and type-check scripts |
| [Side-panel App](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/entries/sidepanel/App.tsx) / [Chrome routes](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/routes/chrome.tsx) | Mounting boundary for new page |
| [Local side-panel chat page](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/routes/sidepanel-chat.tsx) / [Send hook](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/useMessage.tsx) | Automatic restoration, Prompt, background messages, and mode branching |
| [Form](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Sidepanel/Chat/form.tsx) / [Empty state](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Sidepanel/Chat/empty.tsx) | Model validation, queue, tools, and Ollama dependency |
| [Shared message component](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Common/Playground/Message.tsx) | Display reuse and action visibility |
| [Page capture](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/libs/get-html.ts) / [Body extraction](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/parser/default.ts) | DOM injection, additional retrieval, Defuddle, and failure boundaries |
| [Tab chat chain](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/chat-modes/tabChatMode.ts) / [Web Q&A chain](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/chain/chat-with-website.ts) | Why direct model replacement cannot integrate an Agent |
| [Dexie schema](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/db/dexie/schema.ts) / [Types](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/db/dexie/types.ts) | Version 5 and existing local-history structure |
| [Ordinary-history Sidebar](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/components/Option/Sidebar.tsx) | Model/Prompt restoration and local deletion semantics |
| [Extension background](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/entries/background.ts) / [Background-message hook](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/hooks/useBackgroundMessage.tsx) | Selection entry and automatic-send isolation |
| [Import/export](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/src/libs/export-import.ts) / [Existing tests](https://github.com/n4ze3m/page-assist/blob/ad6ef90a9b4b860bbdfc81ee82111c8e04502c65/tests/duckduckgo-parser.test.ts) | Credential exclusion and `node:test` precedent |

### 15.2 Other References and Upgrade Requirements

- [Page Assist project](https://github.com/n4ze3m/page-assist) and [MIT license](https://github.com/n4ze3m/page-assist/blob/main/LICENCE).
- [WXT](https://github.com/wxt-dev/wxt).
- [QwenPaw project](https://github.com/agentscope-ai/QwenPaw) and [documentation](https://qwenpaw.agentscope.io/docs/).

Upgrade only between official stable Releases and revalidate PawApp, identity propagation, task records, approvals, and shutdown behavior. The new protocol and module ledger described here are project work to be implemented; they are not implemented upstream in the stable release.

## 16. Revision History

| Version | Date | Changes |
| --- | --- | --- |
| v1.0 | 2026-10-22 | Initial OpenClaw proposal for web context, conversations, memory, and a separate Bridge |
| v1.1 | 2026-10-22 | Added native OpenClaw execution approvals to the first release |
| v2.0 | 2026-10-23 | Replaced with QwenPaw; changed Bridge to an in-process integration module; reused PawApp, native tasks, conversations, memory, and approvals; removed mandatory one-time approval; rewrote APIs, deployment, recovery, and acceptance |
| v2.1 | 2026-10-23 | Pinned official stable v2.2.2.post1; rechecked release source; removed dependencies on newer plugin SDK, event bus, and hot reload; adopted stable PawApp, TaskTracker, ApprovalService, and centralized adapter |
| v2.2 | 2026-10-23 | Pinned official Page Assist v1.5.88; detailed separate remote routes, component reuse, snapshot capture, Dexie v6, transport recovery, credential backup exclusions, file-level changes, and frontend validation |
