# Page Assist Agent Integration

简体中文 | [English](README.md)

本仓库通过一个可复现的 west 工作区，协调 Page Assist 浏览器扩展与 Agent 宿主适配。
第一版宿主为 QwenPaw；共享契约保持宿主无关，其他 OpenClaw 类 Agent 可通过适配层接入。

工作区包含四个相互独立的 Git 仓库：

| 路径 | 职责 |
| --- | --- |
| `integration/` | 本仓库：west 清单、架构、共享 API 契约及跨仓库检查 |
| `qwenpaw/` | 未修改的 QwenPaw 上游源码参考；运行插件不需要此检出 |
| [`qwenpaw-channel-page-assist/`](https://github.com/refeved/qwenpaw-channel-page-assist) | 独立安装、在宿主进程内运行的 Page Assist 频道插件 |
| `page-assist/` | Page Assist Fork，包含 Remote Agent Provider 界面和传输层；QwenPaw 是首个后端 |

三个项目检出是 west project，**不是 Git submodule**。`west.yml` 记录它们的来源 URL 和版本：
QwenPaw 指向官方上游，Page Assist 指向个人 Fork `refeved/page-assist-agent-usage`，
插件指向 [refeved/qwenpaw-channel-page-assist](https://github.com/refeved/qwenpaw-channel-page-assist)。

## v0.1.0 集成基线

`v0.1.0` 清单固定到以下发布组合：

- QwenPaw `v2.2.2.post1`，提交 `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist Fork tag `remote-agent-preview-1`，提交 `c9eddc0d236bc58944bb0613ec317dd12d548bf1`，
  基于上游 `v1.5.88`（`ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`）
- 插件 tag `remote-agent-preview-1`，提交 `093c3b0a521313efa422dda84b1763219a5ced54`

清单使用 tag 标识发布组合，提交哈希用于精确核对。Page Assist 使用 Fork 地址，
使已打 tag 的远程传输和界面改动可复现。共享或发布工作区之前，确保清单中的每个 tag
和提交都能从对应远程获取。

## Remote Agent 界面

浏览器把远程路径显示为 **Remote Agent**，与 **Local models** 并列。QwenPaw 是首个
后端实现，不是 Provider 名称；协议和存储标识继续使用 `qwenpaw` 命名空间。切换器位于
侧边栏 header 的 Page Assist 字样之后；独立 Web UI 不新增远程发送入口，仍使用原有
本地发送路径。本地既没有 provider 记录、也没有保存过 Ollama URL 时，界面显示 Provider
选择，并在选中后内联展开连接表单；之后可在 options 和侧栏设置的独立 Remote Agent Tab
中配置。该路径不需要 Ollama 配置。

![侧栏设置中的 Remote Agent Tab](docs/assets/page-assist-remote-agent-settings-tab.png)

侧栏设置的 Tab 栏中，Remote Agent 与 General Settings、OpenAI Compatible API 和
Manage Models 并列。截图为中文界面，组件与协议名称保持英文。

Remote Agent 支持文字聊天、显式网页／选区分享、当前实例内的会话历史和新建会话；
本地 RAG、联网搜索、MCP、提示词、临时聊天、逐会话模型参数、文件／图片上传、
视觉／OCR、语音、Page Action 和 WebMCP 在远程界面中不提供。Firefox 不显示
Remote Agent 入口，请使用 Chromium 浏览器。当前界面与协议细节见 Fork 的
[Remote Agent 指南](https://github.com/refeved/page-assist-agent-usage/blob/feat/qwenpaw-remote-channel/docs/qwenpaw-remote.md)。

## 运行效果

Page Assist 侧边栏已连接 Remote Agent（QwenPaw 后端），并可在网页浏览过程中进行多轮对话：

![Page Assist 侧边栏连接 Remote Agent](docs/assets/page-assist-remote-agent-sidepanel.png)

截图来自 v0.1.0 发布组合，拍摄于浏览 GitHub 页面时。截图中的 Agent 名称和对话内容
仅用于演示。

## 初始化

克隆本集成仓库后运行：

```bash
west init -l integration
west update
west list
```

`.west/` 目录会创建在 `integration/` 旁边；三个项目会检出到 `qwenpaw/`、`page-assist/`
和 `qwenpaw-channel-page-assist/`。

`west update` 会同时拉取插件仓库，并检出清单固定的提交。

在已经初始化的工作区中，修改 `west.yml` 后运行：

```bash
west update
```

west 会以 detached HEAD 状态检出清单指定的提交。修改产品仓库之前，请先在相应检出目录创建功能分支。不要用 `west update` 管理未提交的工作。

## 开发职责边界

- 频道行为只在 `qwenpaw-channel-page-assist/` 实现，安装到 pip 发布版 QwenPaw 环境；不修改宿主核心，不添加独立 Bridge 服务。
- 浏览器界面、网页快照和远程传输只在 `page-assist/` 实现。
- 跨仓库开发前，先在 `contracts/` 定义共享 HTTP 和 SSE 行为。
- 工作区编排、跨仓库测试和组合发布由本仓库负责。
- 凭据、真实用户数据和生成的构建产物不得提交到 Git。

## 本地插件安装与验证

在已有 QwenPaw Python 环境中：

```bash
python -m pip install qwenpaw==2.2.2.post1
qwenpaw plugin install /path/to/qwenpaw-channel-page-assist
```

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
修改仓库不会改变宿主管理的已安装插件副本；部署更新时才需要使用 `--force` 重装并重启 QwenPaw。
配置步骤见插件仓库的 [README](https://github.com/refeved/qwenpaw-channel-page-assist/blob/main/README.md)。

完整产品设计与实施计划：[简体中文](docs/design.zh-CN.md) · [English](docs/design.md)。
第一版采用单 Agent 频道插件及进程内专用监听端口，复杂恢复和审批卡片延期；
该阶段对原设计的调整以[基础频道契约](contracts/README.zh-CN.md#第一版基础频道-profile)为准。

参阅[工作区架构](docs/architecture.zh-CN.md)了解职责划分和协作流程；参阅[共享 API 契约](contracts/README.zh-CN.md)了解契约编写规范。

## 许可

本仓库采用 [Apache License 2.0](LICENSE)。

本项目是独立的社区集成，与 Page Assist、QwenPaw 项目无隶属关系，也未获其背书。
上游组件保留各自许可：Page Assist Fork 仍为 MIT，QwenPaw 为 Apache-2.0，
Fork 内置的 QwenPaw 爪子图标保留其 Apache-2.0 声明。
