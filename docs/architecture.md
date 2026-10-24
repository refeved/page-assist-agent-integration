# Workspace architecture

[简体中文](architecture.zh-CN.md) | English

## Runtime

```text
Chrome / Page Assist
        │ HTTPS + browser-specific credentials
        ▼
QwenPaw process
  ├── Page Assist PawApp module and routes
  ├── native sessions, tasks, history, and approvals
  └── selected QwenPaw Agent and its configured tools/memory
```

There is no separately deployed Bridge and no second Agent loop. The browser
extension is a client; QwenPaw remains responsible for Agent execution,
authorization, tool governance, and approval decisions.

The complete product design and implementation plan is documented in
[English](design.md) and [Chinese](design.zh-CN.md).

## Repository ownership

### `integration/`

Owns the west manifest, architecture and protocol documentation, shared
contract fixtures, workspace setup, cross-repository tests, and release
composition. It must not become a second copy of either product's implementation.

### `qwenpaw/`

Owns the in-process PawApp module, browser-facing routes, scoped authentication,
Agent allowlisting, conversation mapping, request deduplication and recovery,
and adapters to QwenPaw's native chat/task/approval services.

### `page-assist/`

Owns the remote QwenPaw view and settings, page snapshot preview, client
transport/SSE handling, remote conversation state, approval UI, and browser-side
tests. Existing non-remote Page Assist modes remain independently usable.

## Cross-repository workflow

1. Specify request/response/event behavior and error semantics in `contracts/`.
2. Implement and test the server change in `qwenpaw/`.
3. Implement and test the client change in `page-assist/`.
4. Run the relevant component checks and the workspace-level integration tests.
5. Push both product commits to accessible forks.
6. Update the exact revisions in `west.yml` to the tested commits.
7. Commit the manifest and integration-test changes here as the reproducible
   combination.

West coordinates repository locations and revisions; it does not provide a
cross-repository transaction or replace each project's dependency manager.
Avoid tracking floating branches in release manifests.

## Security and local data

Commit only non-sensitive configuration examples. Keep credentials, real Agent
workspace data, browser profiles, test conversations, and generated build output
outside version control. The extension and server must use the authorization
and approval boundaries described by their product implementations; workspace
co-location does not grant either component additional runtime authority.
