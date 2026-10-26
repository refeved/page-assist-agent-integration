# Page Assist Agent Integration

简体中文 | [English](README.md)

把自建的 Agent 接进浏览器侧边栏。浏览网页时直接和运行在自己机器或自己服务器上的
QwenPaw Agent 对话，网页内容由你显式选择后才发送。

## 这个项目做什么

[Page Assist](https://github.com/n4ze3m/page-assist) 是一个开源的浏览器 AI 侧边栏，
原生面向本地模型（Ollama 等）。本项目为它增加一条 **Remote Agent** 通道：消息不再
发给模型 API，而是发给一个远程 Agent 运行时，由该 Agent 带着自己的会话、工作区记忆
和工具策略来回答。

第一版后端是 [QwenPaw](https://github.com/agentscope-ai/QwenPaw)。共享的 HTTP 与 SSE
契约保持宿主无关，其他 OpenClaw 类 Agent 可以通过适配层接入。

## 解决什么问题

在浏览器里用 AI，通常得在三种处境里选一种：

- 云端订阅侧边栏：开箱即用，但网页和问题都交给第三方，能力也由服务商决定。
- 本地模型侧边栏：数据不出门，但没有 Agent 的会话记忆、工具和审批。
- 自建 Agent：这些都有，但入口在终端或自己的 Web UI 里。看网页时要来回切换，
  网页内容还得手动复制粘贴。

本项目把自建 Agent 接到浏览器侧边栏这个入口上，并且：

- **用你自己的 Agent 回答**：请求进入所选 Agent 的正常运行路径，复用它的会话历史、
  工作区记忆和工具策略，不另起一套 Agent 循环。
- **网页内容由你决定**：当前页正文或选中文字，显式选择后才发送，不自动采集。
- **不复制状态**：不向浏览器复制记忆，不引入客户端向量库，不重复发送完整远程历史。
- **不多一个服务**：频道在 QwenPaw 进程内运行，浏览器直连宿主，不部署中继服务。
- **不越过权限**：批准和拒绝仍走 QwenPaw 原生审批。浏览器是新入口，不是权限裁决方。

## 运行效果

浏览网页时，在侧边栏与 Remote Agent（QwenPaw 后端）多轮对话：

![Page Assist 侧边栏连接 Remote Agent](docs/assets/page-assist-remote-agent-sidepanel.png)

截图来自 v0.1.0 发布组合，拍摄于浏览 GitHub 页面时；v0.1.1 布局相同，但侧栏用
配置的 Agent 名称标识回复。截图中的 Agent 名称和对话内容仅用于演示。

## 亮点

- **在成熟前端上加一条通道，而不是再造一个侧边栏**：复用 Page Assist 的网页读取与
  聊天体验，本地模型路径保持独立可用。
- **浏览器直连宿主进程**：频道插件安装进 pip 发布的 QwenPaw 并在其进程内运行，
  没有浏览器与 Agent 之间的中继服务。
- **契约与宿主解耦**：请求、响应、SSE 事件和错误语义定义在 `contracts/`，
  QwenPaw 只是首个后端。
- **远程视图按能力渲染**：界面能力由 `provider-capabilities.ts` 统一判定，
  不挂载本地消息控制器。
- **组合可复现**：发布版本在独立分支上把每个组件固定到 tag 或提交，再为该分支打 tag。

## 当前能力范围

Remote Agent 与本地模型是两条独立路径，能力并不相同：

| 远程可用 | 远程不可用 |
| --- | --- |
| 文字聊天 | 本地 RAG、联网搜索、MCP、提示词 |
| 显式网页／选区分享 | 临时聊天、逐会话模型参数 |
| 当前实例内的会话历史 | 文件／图片上传、视觉／OCR、语音 |
| 新建会话 | Page Action、WebMCP |

Firefox 不显示 Remote Agent 入口，请使用 Chromium 浏览器。当前界面与协议细节见 Fork 的
[Remote Agent 指南](https://github.com/refeved/page-assist-agent-usage/blob/feat/qwenpaw-remote-channel/docs/qwenpaw-remote.md)。

## 界面与配置

浏览器把远程路径显示为 **Remote Agent**，与 **Local models** 并列。切换器位于侧边栏
header 的 Page Assist 字样之后。QwenPaw 是首个后端实现，不是 Provider 名称；协议和
存储标识继续使用 `qwenpaw` 命名空间。

本地既没有 provider 记录、也没有保存过 Ollama URL 时，界面显示 Provider 选择，并在
选中后内联展开连接表单；之后可在 options 和侧栏设置的独立 Remote Agent Tab 中配置。
该路径不需要 Ollama 配置。独立 Web UI 不新增远程发送入口，仍使用原有本地发送路径。

![首次启动时的 Provider 选择，Remote Agent 已选中](docs/assets/page-assist-first-setup.png)

首次启动时侧边栏会询问对话方式；选中 Remote Agent 后连接表单就地展开。截图为尚未
保存任何连接时的选择页面。

![侧栏设置中的 Remote Agent Tab](docs/assets/page-assist-remote-agent-settings-tab.png)

侧栏设置的 Tab 栏中，Remote Agent 与 General Settings、OpenAI Compatible API 和
Manage Models 并列。截图为中文界面，组件与协议名称保持英文。

## 工作区组成

本仓库通过一个可复现的 west 工作区，协调 Page Assist 浏览器扩展与 Agent 宿主适配。
工作区包含四个相互独立的 Git 仓库：

| 路径 | 职责 |
| --- | --- |
| `integration/` | 本仓库：west 清单、架构、共享 API 契约及跨仓库检查 |
| `qwenpaw/` | 未修改的 QwenPaw 上游源码参考；运行插件不需要此检出 |
| [`qwenpaw-channel-page-assist/`](https://github.com/refeved/qwenpaw-channel-page-assist) | 独立安装、在宿主进程内运行的 Page Assist 频道插件 |
| `page-assist/` | Page Assist Fork，包含 Remote Agent Provider 界面和传输层；QwenPaw 是首个后端 |

三个项目检出是 west project，**不是 Git submodule**。`west.yml` 记录它们的来源 URL
和版本：QwenPaw 指向官方上游，Page Assist 指向个人 Fork
`refeved/page-assist-agent-usage`，插件指向
[refeved/qwenpaw-channel-page-assist](https://github.com/refeved/qwenpaw-channel-page-assist)。

## 快速开始

### 初始化

```bash
west init -l integration
west update
west list
```

`.west/` 目录会创建在 `integration/` 旁边；三个项目会检出到 `qwenpaw/`、`page-assist/`
和 `qwenpaw-channel-page-assist/`。

`west update` 会同时拉取插件仓库，并检出清单指定的 revision。

在已经初始化的工作区中，修改 `west.yml` 后运行：

```bash
west update
```

revision 为分支时 west 检出对应分支，为 tag 或提交时处于 detached HEAD。
`main` 跟踪开发分支，请先在项目仓库提交并推送，再运行 `west update`。
不要用 `west update` 管理未提交的工作。

### 安装 QwenPaw 与频道插件

在已有 QwenPaw Python 环境中：

```bash
python -m pip install qwenpaw==2.2.2.post1
qwenpaw plugin install /path/to/qwenpaw-channel-page-assist
```

配置步骤见插件仓库的
[README](https://github.com/refeved/qwenpaw-channel-page-assist/blob/main/README.md)。

修改仓库不会改变宿主管理的已安装插件副本。部署插件更新时，请运行重载脚本，
而不是直接执行 `plugin install --force`：

```bash
scripts/reload-channel-plugin.sh
```

热重载只绑定一次频道端口且不会重试，因此旧实例可能仍占用端口，新实例却启动失败。
此时 CLI 仍打印成功、旧 socket 继续响应，但新代码从未生效。脚本会比较重载前后的
监听 socket inode，等待旧 socket 释放端口、重试安装，必要时可重启宿主服务释放端口：

```bash
scripts/reload-channel-plugin.sh --restart   # 回退到重启 QwenPaw
scripts/reload-channel-plugin.sh --help      # 全部选项与环境变量
```

### 构建并加载扩展

在 `page-assist/` 中安装依赖并构建 Chrome 包，然后在浏览器的扩展页面加载已解压扩展：

```bash
bun install
bun run build:chrome
```

产物位于 `.output/chrome-mv3/`。

## 分支与发布

`main` 是开发主线，其 `west.yml` 跟踪各项目的活跃开发引用：Page Assist 跟踪
`feat/qwenpaw-remote-channel`，插件跟踪 `main`，QwenPaw 固定在发布 tag `v2.2.2.post1`。
`west update` 会直接检出这些分支，因此请先在项目仓库提交并推送，再更新清单。

版本号在独立的发布分支上产生，而不是在 `main` 上改 revision：

1. 从已验证的 `main` 提交创建 `release/vX.Y.Z`。
2. 在该分支把 `west.yml` 中每个 project 固定到可从远程获取的发布 tag 或提交，
   并在下方「发布基线」中列出 tag 与提交哈希。
3. 为该分支打 `vX.Y.Z` tag，推送分支和 tag。
4. `main` 保持跟踪开发引用。

复现某个发布组合时，在本仓库检出对应 tag 后运行 `west update`，
各项目会以 detached HEAD 检出固定提交。

## 发布基线

tag `v0.1.1` 是当前发布组合。它位于 `release/v0.1.1` 分支，该分支的 `west.yml`
把每个 project 固定到 tag；`main` 继续跟踪开发引用：

- QwenPaw `v2.2.2.post1`，提交 `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist Fork tag `agent-usage-v0.1.1`，提交
  `5a384102379caf2beff86400140c0217fa813920`
- 插件 tag `qwenpaw-channel-page-assist-v0.1.1`，提交
  `fe06550af6c269fbcd15700321ff8747a879b60c`

v0.1.1 是上述发布分支流程产出的首个组合：侧栏回复用配置的 Agent 名称标识，
不再使用固定标签。运行该组合时检出 `release/v0.1.1` 或 `v0.1.1` tag，
再执行 `west update`。

tag `v0.1.0` 记录首个发布组合。它早于发布分支流程，因此仅由该 tag 标识：

- QwenPaw `v2.2.2.post1`，提交 `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist Fork tag `remote-agent-preview-1`，提交 `c9eddc0d236bc58944bb0613ec317dd12d548bf1`，
  基于上游 `v1.5.88`（`ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`）
- 插件 tag `remote-agent-preview-1`，提交 `093c3b0a521313efa422dda84b1763219a5ced54`

发布组合使用 tag 标识各组件，提交哈希用于精确核对。Page Assist 使用 Fork 地址，
使已打 tag 的远程传输和界面改动可复现。共享或发布工作区之前，确保每个 tag
和提交都能从对应远程获取。

## 开发职责边界

- 频道行为只在 `qwenpaw-channel-page-assist/` 实现，安装到 pip 发布版 QwenPaw 环境；不修改宿主核心，不在浏览器与 QwenPaw 之间添加独立中继服务。
- 浏览器界面、网页快照和远程传输只在 `page-assist/` 实现。
- 跨仓库开发前，先在 `contracts/` 定义共享 HTTP 和 SSE 行为。
- 工作区编排、跨仓库测试和组合发布由本仓库负责。
- 凭据、真实用户数据和生成的构建产物不得提交到 Git。

## 测试与验证

开发时在开发环境安装插件仓库的 `requirements-dev.txt`。
从工作区根目录验证已安装的发布版，不注入源码路径：

```bash
env -u PYTHONPATH .venv/bin/python -m pytest -q \
  qwenpaw-channel-page-assist/tests/test_channel.py
cd page-assist
node tests/qwenpaw-channel-browser.mjs
```

浏览器回归需要已构建的扩展和 Page Assist 测试依赖。
`QWENPAW_TEST_PYTHON` 可指定测试解释器，`QWENPAW_CHANNEL_DIR` 可指定插件仓库路径。

## 更多文档

- 完整产品设计与实施计划：[简体中文](docs/design.zh-CN.md) · [English](docs/design.md)
- 工作区架构与协作流程：[简体中文](docs/architecture.zh-CN.md) · [English](docs/architecture.md)
- 共享 API 契约：[简体中文](contracts/README.zh-CN.md) · [English](contracts/README.md)

第一版采用单 Agent 频道插件及进程内专用监听端口，复杂恢复和审批卡片延期；
该阶段对原设计的调整以[基础频道契约](contracts/README.zh-CN.md#第一版基础频道-profile)为准。

## 文档语言政策

本集成仓库中的每个 Markdown 文档都必须有中文和英文两个版本，内容保持同步，并在
两个文件顶部附近互相添加语言链接。目录入口页使用 `README.md` / `README.zh-CN.md`，
其他文档使用 `name.md` / `name.zh-CN.md`。代码、标识符、命令和协议字段名在翻译中
保持不变。

## 许可

本仓库采用 [Apache License 2.0](LICENSE)。

本项目是独立的社区集成，与 Page Assist、QwenPaw 项目无隶属关系，也未获其背书。
上游组件保留各自许可：Page Assist Fork 仍为 MIT，QwenPaw 为 Apache-2.0，
Fork 内置的 QwenPaw 爪子图标保留其 Apache-2.0 声明。
