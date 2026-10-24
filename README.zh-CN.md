# QwenPaw + Page Assist

简体中文 | [English](README.md)

本仓库通过一个可复现的 west 工作区，协调 QwenPaw 服务端集成与 Page Assist 浏览器扩展。

工作区包含四个相互独立的 Git 仓库：

| 路径 | 职责 |
| --- | --- |
| `integration/` | 本仓库：west 清单、架构、共享 API 契约及跨仓库检查 |
| `qwenpaw/` | 未修改的 QwenPaw 上游源码参考；运行插件不需要此检出 |
| `qwenpaw-channel-page-assist/` | 独立安装、在宿主进程内运行的 Page Assist 频道插件 |
| `page-assist/` | Page Assist Fork，包含 QwenPaw 远程访问界面和传输层 |

两个产品检出是 west project，**不是 Git submodule**。`west.yml` 记录它们的来源 URL 和版本：
QwenPaw 指向官方上游，Page Assist 指向个人 Fork `refeved/page-assist-agent-usage`。
新插件仓库目前仅在本地，尚未配置远程 URL，也未纳入 west；不要向发布清单写入虚构 URL 或只在本地存在的提交。

## 稳定版基线

清单固定到已分析的版本：

- QwenPaw `2.2.2.post1`，提交 `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist Fork 提交 `c7ea951a0e3ba4c67bfa7f21761f8fcd2134b6ad`，
  基于上游 `v1.5.88`（`ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`）

Page Assist 使用 Fork 地址，使已提交的远程传输和界面改动可复现。
共享或发布工作区之前，确保清单中的每个提交都能从对应远程获取。

## 初始化

克隆本集成仓库后运行：

```bash
west init -l integration
west update
west list
```

`.west/` 目录会创建在 `integration/` 旁边；两个产品仓库会检出到 `qwenpaw/` 和 `page-assist/`。

`west update` 不会获取独立插件。插件检出应放在同级 `qwenpaw-channel-page-assist/`。
提供真实远程 URL 后，再将插件加入清单，并将两端固定到已测试、远程可获取的提交。

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
配置步骤见插件仓库的 `README.md`（`qwenpaw-channel-page-assist/README.md`）。

完整产品设计与实施计划：[简体中文](docs/design.zh-CN.md) · [English](docs/design.md)。
第一版采用单 Agent 频道插件及进程内专用监听端口，复杂恢复和审批卡片延期；
该阶段对原设计的调整以[基础频道契约](contracts/README.zh-CN.md#第一版基础频道-profile)为准。

参阅[工作区架构](docs/architecture.zh-CN.md)了解职责划分和协作流程；参阅[共享 API 契约](contracts/README.zh-CN.md)了解契约编写规范。

## 许可

本仓库采用 [Apache License 2.0](LICENSE)。

本项目是独立的社区集成，与 Page Assist、QwenPaw 项目无隶属关系，也未获其背书。
上游组件保留各自许可：Page Assist Fork 仍为 MIT，QwenPaw 为 Apache-2.0，
Fork 内置的 QwenPaw 爪子图标保留其 Apache-2.0 声明。
