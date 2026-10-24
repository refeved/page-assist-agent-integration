# Shared API contracts

[简体中文](README.zh-CN.md) | English

This directory is the shared source of truth for the Page Assist HTTP API and
server-sent event (SSE) payloads. Keep the contract independent of either
product's implementation.

Before implementing a cross-repository feature, add or update:

- OpenAPI definitions for HTTP paths, authentication requirements, request and
  response bodies, and error responses.
- JSON Schemas and representative fixtures for SSE event payloads.
- Examples for recovery, duplicate request handling, and terminal states where
  relevant.

Contract changes should describe observable behavior, including authorization,
idempotency, reconnection, and error semantics. Validate both implementations
against the same fixtures in workspace-level tests. Do not introduce a separate
Bridge process or make either product repository depend on this repository at runtime.

## First release: basic channel profile

The first release uses an independently installed `page_assist` channel. It may
open a dedicated HTTP listener **inside the QwenPaw process** (default
`127.0.0.1:8766`). This intentionally relaxes the original same-port requirement,
not the no-separate-Bridge-process requirement.

The [Chinese profile table](README.zh-CN.md#第一版基础频道-profile) records the
observable behavior. Payloads follow the [frontend contract](https://github.com/refeved/page-assist-agent-usage/blob/c7ea951a0e3ba4c67bfa7f21761f8fcd2134b6ad/docs/qwenpaw-remote.md);
setup is documented in `qwenpaw-channel-page-assist/README.md` in the workspace.
The plugin is developed and versioned independently of the pip-installed
QwenPaw host; the upstream source checkout is not required at runtime.

All endpoints, including SSE, require a channel-specific bearer token. One token
represents one browser user with access to the bound Agent, not per-tool scopes
or multi-user authorization. `recovery`, `approvals` and `approvalEvents` are false.
Responses use complete assistant snapshots followed by an explicit terminal
event. The frontend must consume that terminal event even without recovery.
Busy conversations and conflicting request IDs return 409; identical submissions
within the same instance do not run twice. Missing resources return 404. Capacity
is 100 conversations / 500 requests, after which writes return 429.

State and display history are in memory, not durable native-history recovery.
New instances have new IDs to partition browser caches. Disconnects do not cancel
Agent execution or cause a write retry. Unknown outcomes remain locked. Native
approvals are handled separately in the Console, never automatically granted.

Global Agent discovery, durable recovery, token deltas, browser approval cards,
rich media and remote cancellation are deferred. Deterministic transport tests
are not real-model, memory or tool-approval acceptance.
