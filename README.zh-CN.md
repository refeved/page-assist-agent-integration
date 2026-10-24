# QwenPaw + Page Assist

简体中文 | [English](README.md)

本仓库通过一个可复现的 west 工作区，协调 QwenPaw 服务端集成与 Page Assist 浏览器扩展。

工作区包含三个相互独立的 Git 仓库：

| 路径 | 职责 |
| --- | --- |
| `integration/` | 本仓库：west 清单、架构、共享 API 契约及跨仓库检查 |
| `qwenpaw/` | QwenPaw 服务端，包含进程内运行的 Page Assist 模块 |
| `page-assist/` | Page Assist Fork，包含 QwenPaw 远程访问界面和传输层 |

两个产品仓库是 west project，**不是 Git submodule**。`west.yml` 是其 URL 和提交版本的唯一来源。不要再将它们添加到 `.gitmodules`。

## 稳定版基线

清单固定到已分析的稳定版本：

- QwenPaw `2.2.2.post1`，提交 `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist `v1.5.88`，提交 `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`

由于尚未提供个人或组织 Fork 的 URL，当前清单使用官方上游地址。在推送产品改动或共享工作区之前，请创建 Fork 并更新 `west.yml` 中的 `url`。确保清单引用的提交可从对应 Fork 获取。

## 初始化

克隆本集成仓库后运行：

```bash
west init -l integration
west update
west list
```

`.west/` 目录会创建在 `integration/` 旁边；两个产品仓库会检出到 `qwenpaw/` 和 `page-assist/`。

在已经初始化的工作区中，修改 `west.yml` 后运行：

```bash
west update
```

west 会以 detached HEAD 状态检出清单指定的提交。修改产品仓库之前，请先在相应检出目录创建功能分支。不要用 `west update` 管理未提交的工作。

## 开发职责边界

- 服务端行为只在 `qwenpaw/` 实现；集成功能运行于 QwenPaw 进程内，不添加独立 Bridge 服务。
- 浏览器界面、网页快照和远程传输只在 `page-assist/` 实现。
- 跨仓库开发前，先在 `contracts/` 定义共享 HTTP 和 SSE 行为。
- 工作区编排、跨仓库测试和组合发布由本仓库负责。
- 凭据、真实用户数据和生成的构建产物不得提交到 Git。

完整产品设计与实施计划：[简体中文](docs/design.zh-CN.md) · [English](docs/design.md)。

参阅[工作区架构](docs/architecture.zh-CN.md)了解职责划分和协作流程；参阅[共享 API 契约](contracts/README.zh-CN.md)了解契约编写规范。
