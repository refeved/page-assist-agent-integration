# Workspace architecture

[简体中文](architecture.zh-CN.md) | English

## Runtime

```text
Chrome / Page Assist
        │ HTTPS + browser-specific credentials
        ▼
QwenPaw process
  ├── independently installed Page Assist channel (dedicated HTTP listener)
  ├── native sessions, tasks, history, and approvals
  └── selected QwenPaw Agent and its configured tools/memory
```

There is no separately deployed Bridge and no second Agent loop. The browser
extension is a client; QwenPaw remains responsible for Agent execution,
authorization, tool governance, and approval decisions.

The complete product design and implementation plan is documented in
[English](design.md) and [Chinese](design.zh-CN.md).
Those documents describe the broader target; the current
[basic channel profile](../contracts/README.md#first-release-basic-channel-profile)
takes precedence for this release.

## Repository ownership

### `integration/`

Owns the west manifest, architecture and protocol documentation, shared
contract fixtures, workspace setup, cross-repository tests, and release
composition. It must not become a second copy of either product's implementation.

### `qwenpaw/`

An unmodified upstream source reference. The runtime host is pip-installed
QwenPaw `2.2.2.post1`; developing and installing the channel does not require
editing this checkout or building its Console.

### `qwenpaw-channel-page-assist/`

Owns the plugin manifest, dedicated authenticated HTTP/SSE listener, single-Agent
conversation mapping, in-instance request deduplication, and native BaseChannel /
TaskTracker integration. History and request state are memory-only; durable
recovery and browser approval decisions remain deferred. Native approval policy
is not bypassed. The repository root is directly installable by `qwenpaw plugin install`;
the remote is [refeved/qwenpaw-channel-page-assist](https://github.com/refeved/qwenpaw-channel-page-assist).

### `page-assist/`

Owns the remote QwenPaw view and settings, page snapshot preview, client
transport/SSE handling, remote conversation state, approval UI, and browser-side
tests. Existing non-remote Page Assist modes remain independently usable.

## Cross-repository workflow

1. Specify request/response/event behavior and error semantics in `contracts/`.
2. Implement and test the channel change in `qwenpaw-channel-page-assist/` against
   the installed QwenPaw release.
3. Implement and test the client change in `page-assist/`.
4. Run the relevant component checks and the workspace-level integration tests.
5. Publish verified commits to the plugin repository and the Page Assist fork
   remotes.
6. Add the plugin project and update the exact revisions in `west.yml` to tested
   commits available from those remotes. Until then the plugin is a local checkout
   outside west and the manifest records upstream baselines only.
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
