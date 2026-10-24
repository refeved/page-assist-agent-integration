# 工作区架构

简体中文 | [English](architecture.md)

## 运行时架构

```text
Chrome / Page Assist
        │ HTTPS + 浏览器专用凭据
        ▼
QwenPaw 进程
  ├── 独立安装的 Page Assist 频道（专用 HTTP 监听）
  ├── 原生会话、任务、历史和审批
  └── 所选 QwenPaw Agent 及其配置的工具／记忆
```

不单独部署 Bridge，也不运行第二套 Agent 循环。浏览器扩展是客户端；QwenPaw 继续负责 Agent 执行、授权、工具治理和审批决定。

完整的产品设计与实施计划见[简体中文版](design.zh-CN.md)和[英文版](design.md)。
这些文档描述更广泛的目标；本版本以[基础频道 profile](../contracts/README.zh-CN.md#第一版基础频道-profile)为准。

## 仓库职责

### `integration/`

负责 west 清单、架构和协议文档、共享契约样例、工作区设置、跨仓库测试和组合发布。不得在这里复制任一产品的实现。

### `qwenpaw/`

仅作为未修改的上游源码参考。运行时宿主使用 pip 安装的 QwenPaw `2.2.2.post1`；
开发和安装频道无需修改此检出或构建其 Console。

### `qwenpaw-channel-page-assist/`

负责插件清单、专用认证 HTTP／SSE 监听、单 Agent 会话映射、实例内请求去重，
以及原生 BaseChannel／TaskTracker 接入。历史和请求状态仅保存在内存；
持久恢复和浏览器审批决定延期，不绕过原生审批策略。
仓库根目录可以直接通过 `qwenpaw plugin install` 安装；远程仓库为
[refeved/qwenpaw-channel-page-assist](https://github.com/refeved/qwenpaw-channel-page-assist)。

### `page-assist/`

负责 QwenPaw 远程界面和设置、网页快照预览、客户端传输／SSE 处理、远程会话状态、审批界面和浏览器端测试。Page Assist 现有的非远程模式仍应独立可用。

## 跨仓库协作流程

1. 先在 `contracts/` 明确请求、响应、事件行为及错误语义。
2. 在 `qwenpaw-channel-page-assist/` 实现频道改动，针对已安装的 QwenPaw 发布版测试。
3. 在 `page-assist/` 实现并测试客户端改动。
4. 运行相关组件检查和工作区级集成测试。
5. 将已验证的提交发布到插件仓库和 Page Assist Fork 的远程分支。
6. 在 `west.yml` 中固定插件、QwenPaw 和 Page Assist 的精确提交，确保均可从远程获取。
7. 在本仓库提交清单和集成测试改动，记录可复现的组合。

west 负责协调仓库位置和版本；它不提供跨仓库事务，也不能替代各项目自己的依赖管理。发布清单应避免跟踪浮动分支。

## 安全与本地数据

只提交不含敏感信息的配置示例。凭据、真实 Agent 工作区数据、浏览器配置目录、测试对话和构建产物应保存在版本控制之外。扩展和服务端必须遵循各自实现中的授权与审批边界；仅仅位于同一工作区，不会赋予任何组件额外的运行时权限。
