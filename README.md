# Page Assist Agent Integration

[简体中文](README.zh-CN.md) | English

Bring your own Agent into the browser side panel. Chat with a QwenPaw Agent running
on your own machine or your own server while you browse, and send page content only
when you explicitly choose to.

## What this project does

[Page Assist](https://github.com/n4ze3m/page-assist) is an open-source browser AI
side panel built for local models (Ollama and similar). This project adds a
**Remote Agent** channel to it: messages no longer go to a model API. They go to a
remote Agent runtime, which answers with its own session, workspace memory, and
tool policy.

The first backend is [QwenPaw](https://github.com/agentscope-ai/QwenPaw). The shared
HTTP and SSE contracts stay host-neutral, so other OpenClaw-like Agents can plug in
through an adapter.

## What it solves

Using AI in the browser usually means picking one of three trade-offs:

- A cloud subscription side panel: works out of the box, but the page and the
  question both go to a third party, and the vendor decides the feature set.
- A local-model side panel: data stays home, but there is no Agent session memory,
  tool use, or approval flow.
- A self-hosted Agent: has all of that, but lives in a terminal or its own Web UI.
  You switch windows while browsing and paste page content by hand.

This project connects a self-hosted Agent to the side-panel entry point you already
use, and:

- **Answers come from your own Agent**: requests enter the selected Agent's normal
  run path and reuse its session history, workspace memory, and tool policy. No
  second Agent loop.
- **You decide what the page contributes**: the current page body or the selected
  text, sent only after you choose. Nothing is captured automatically.
- **No state is copied**: no memory duplication into the browser, no client-side
  vector store, no resending the full remote history.
- **No extra service**: the channel runs inside the QwenPaw process and the browser
  connects to the host directly. No relay in between.
- **No permission bypass**: approvals still follow native QwenPaw flows. The browser
  is a new entry point, not an authority on tool permissions.

## In action

A multi-turn conversation with a Remote Agent (QwenPaw backend) in the side panel
while browsing:

![Page Assist side panel connected to a Remote Agent](docs/assets/page-assist-remote-agent-sidepanel.png)

Captured from the v0.1.0 release set while browsing GitHub; v0.1.1 keeps the
same layout but labels replies with the configured Agent name. Agent names and
conversation content are for demonstration only.

## Highlights

- **A channel on a mature frontend, not another side panel**: reuses Page Assist's
  page reading and chat experience, and the local-model path stays independently
  usable.
- **The browser talks to the host process directly**: the channel plugin installs
  into pip-distributed QwenPaw and runs in its process. No relay between browser
  and Agent.
- **Contract decoupled from the host**: requests, responses, SSE events, and error
  semantics live in `contracts/`. QwenPaw is only the first backend.
- **Remote view renders from capabilities**: the UI decides what to show through
  `provider-capabilities.ts` and does not mount the local message controller.
- **Reproducible combinations**: a release pins every component to a tag or commit
  on its own branch, then tags that branch.

## Current capability scope

Remote Agent and local models are separate paths with different capabilities:

| Available remotely | Not available remotely |
| --- | --- |
| Text chat | Local RAG, web search, MCP |
| Explicit webpage or selection sharing | Temporary chat, per-chat model settings |
| Image, file and page-screenshot attachments | OCR, Page Action, WebMCP |
| In-browser approvals (approve/deny under native policy) | Message edit/regenerate, branch, continue |
| In-instance conversation history, new chats | Cross-restart recovery, automatic reconnect |
| Speech dictation, TTS playback, quick prompts (run in the browser) | — |

Firefox does not expose Remote Agent; use a Chromium browser. See the fork's
[Remote Agent guide](https://github.com/refeved/page-assist-agent-usage/blob/feat/qwenpaw-remote-channel/docs/qwenpaw-remote.md)
for current UI and protocol details.

## UI and configuration

The browser exposes the remote path as **Remote Agent**, alongside **Local models**.
The switch sits in the side-panel header after the Page Assist wordmark. QwenPaw is
the first backend implementation, not the provider name; protocol and storage
identifiers keep the `qwenpaw` namespace.

When no provider has been chosen and no Ollama URL is saved, a provider chooser opens
the connection form inline. Later configuration lives in the dedicated Remote Agent
tab in both the options page and side-panel settings. This path needs no Ollama
configuration. The standalone Web UI adds no remote send entry point and keeps its
existing local send path.

![First-run provider chooser with Remote Agent selected](docs/assets/page-assist-first-setup.png)

On first run the side panel asks how to chat; selecting Remote Agent expands the
connection form inline. The screenshot shows the picker before any connection is
saved.

![Remote Agent tab in the side-panel settings](docs/assets/page-assist-remote-agent-settings-tab.png)

The side-panel settings bar shows Remote Agent beside General Settings, OpenAI
Compatible API, and Manage Models. The screenshot uses the Chinese UI; component and
protocol names stay in English.

## Workspace layout

This repository coordinates the Page Assist browser extension and Agent host adapters
through a reproducible west workspace. It contains four independent Git repositories:

| Path | Role |
| --- | --- |
| `integration/` | This repository: west manifest, architecture, shared API contracts, and cross-repository checks |
| `qwenpaw/` | Unmodified upstream QwenPaw source reference; not required to run the plugin |
| [`qwenpaw-channel-page-assist/`](https://github.com/refeved/qwenpaw-channel-page-assist) | Independently installed in-process Page Assist channel plugin |
| `page-assist/` | Page Assist fork, including the Remote Agent provider UI and transport; QwenPaw is the first backend |

The three project checkouts are west projects, **not Git submodules**. `west.yml`
records their source URLs and revisions: QwenPaw tracks the official upstream, Page
Assist tracks the personal fork `refeved/page-assist-agent-usage`, and the plugin
tracks
[refeved/qwenpaw-channel-page-assist](https://github.com/refeved/qwenpaw-channel-page-assist).

## Quick start

### Prebuilt downloads (optional)

To skip building the extension, download the
`page-assist-chrome-mv3-v0.1.2.zip` asset from
[GitHub Releases](https://github.com/refeved/page-assist-agent-integration/releases/tag/v0.1.2),
unzip it, and use "Load unpacked extension" on the browser's extensions page
pointing at the unzipped `chrome-mv3` directory (Chrome/Chromium only; Firefox
does not expose Remote Agent). The plugin needs no build; its tag archive
`https://github.com/refeved/qwenpaw-channel-page-assist/archive/refs/tags/qwenpaw-channel-page-assist-v0.1.2.zip`
can be unzipped and installed per the plugin README.

### Initialize

```bash
west init -l integration
west update
west list
```

The `.west/` directory is created beside `integration/`; the three project checkouts
appear at `qwenpaw/`, `page-assist/`, and `qwenpaw-channel-page-assist/`.

`west update` also fetches the plugin repository and checks out the manifest
revision.

In an already initialized workspace, update projects after changing `west.yml` with:

```bash
west update
```

West checks out branch revisions on the branch itself and tag or commit revisions in
detached-HEAD state. Because `main` follows development branches, commit and push in
the product checkout before rerunning `west update`. Do not use `west update` to
manage uncommitted work.

### Install QwenPaw and the channel plugin

In an existing QwenPaw Python environment:

```bash
python -m pip install qwenpaw==2.2.2.post1
qwenpaw plugin install /path/to/qwenpaw-channel-page-assist
```

See the plugin repository's
[README](https://github.com/refeved/qwenpaw-channel-page-assist/blob/main/README.md)
for configuration.

Changing the checkout does not change the installed plugin copy. To deploy a
plugin update, run the reload helper instead of a bare `plugin install --force`:

```bash
scripts/reload-channel-plugin.sh
```

A hot reload binds the channel port once and does not retry, so the previous
instance can still hold the port when the new one starts. The CLI then prints
success and the stale socket keeps answering, while the new code never took
effect. The helper compares the listening socket inode across the reload, waits
for the old socket to release the port, retries the install, and can restart the
host service to free the port:

```bash
scripts/reload-channel-plugin.sh --restart   # fall back to restarting QwenPaw
scripts/reload-channel-plugin.sh --help      # all options and overrides
```

### Build and load the extension

Install dependencies and build the Chrome package in `page-assist/`, then load the
unpacked extension from the browser's extensions page:

```bash
bun install
bun run build:chrome
```

The build lands in `.output/chrome-mv3/`.

## Branches and releases

`main` is the development line. Its `west.yml` follows active development refs:
Page Assist tracks `feat/qwenpaw-remote-channel`, the plugin tracks `main`, and
QwenPaw stays on the released tag `v2.2.2.post1`. `west update` checks those
branches out directly, so commit and push in the project checkout before updating
the manifest.

Cut a version on its own release branch instead of retargeting `main`:

1. Create `release/vX.Y.Z` from the validated `main` commit.
2. On that branch, pin every project in `west.yml` to a release tag or commit
   available from its remote, and list the tags and commit hashes under
   "Release baseline" below.
3. Tag the branch `vX.Y.Z`, then push the branch and the tag.
4. Leave `main` on its development refs.

To reproduce a released set, check out its tag here and run `west update`; each
project checks out the pinned commit in detached HEAD.

## Release baseline

Tag `v0.1.2` is the current release set. It lives on the `release/v0.1.2`
branch, whose `west.yml` pins every project to a tag; `main` keeps tracking
development refs:

- QwenPaw `v2.2.2.post1`, commit `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist fork tag `agent-usage-v0.1.2`, commit
  `afe8aa741a6420b8262904917820b87c668ffb1e`
- Plugin tag `qwenpaw-channel-page-assist-v0.1.2`, commit
  `6d08babef62e9d8c3ab5d05550924f1c71aa1d28`

v0.1.2 promotes everything developed after v0.1.1: image/file/page-screenshot
attachments (with step-down compression over the cap and one shrunk retry after
a relay 413), in-browser approvals (composer popover, rendered in full,
reconciled by 5-second polling), speech dictation, TTS playback, quick-prompt
insertion, and the scroll fix that no longer blanks and rebuilds the transcript
on submit. To run this set, check out the `v0.1.2` tag and rerun `west update`;
prebuilt artifacts are covered in "Prebuilt downloads" above.

Tag `v0.1.1` was the first set produced by the release-branch workflow. It
labels side-panel replies with the configured Agent name instead of a fixed
label.

- QwenPaw `v2.2.2.post1`, commit `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist fork tag `agent-usage-v0.1.1`, commit
  `5a384102379caf2beff86400140c0217fa813920`
- Plugin tag `qwenpaw-channel-page-assist-v0.1.1`, commit
  `fe06550af6c269fbcd15700321ff8747a879b60c`

Tag `v0.1.0` is the first released combination. It predates the release-branch
workflow, so the tag alone identifies it:

- QwenPaw `v2.2.2.post1`, commit `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist fork tag `remote-agent-preview-1`, commit
  `c9eddc0d236bc58944bb0613ec317dd12d548bf1`, based on upstream `v1.5.88`
  (`ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`)
- Plugin tag `remote-agent-preview-1`, commit `093c3b0a521313efa422dda84b1763219a5ced54`

The release set uses tags to identify components; the commit hashes provide exact
verification. Page Assist uses the fork URL so the tagged remote transport and UI
changes are reproducible. Keep every tag and commit available from the configured
remote before sharing or publishing the workspace.

## Development boundaries

- Implement channel behavior only in `qwenpaw-channel-page-assist/`; install it
  into a pip-distributed QwenPaw environment. Do not modify upstream core or add a
  separate relay service between the browser and QwenPaw.
- Implement browser UI, page snapshotting, and remote transport only in
  `page-assist/`.
- Define shared HTTP and SSE behavior in `contracts/` before implementing
  cross-repository changes.
- Put orchestration, cross-repository tests, and release composition here.
- Keep credentials, real user data, and generated artifacts out of Git.

## Testing and verification

Install the plugin repository's `requirements-dev.txt` into a development
environment. From the workspace root, verify against the installed release, without
a source-path override:

```bash
env -u PYTHONPATH .venv/bin/python -m pytest -q \
  qwenpaw-channel-page-assist/tests/test_channel.py
cd page-assist
node tests/qwenpaw-channel-browser.mjs
```

The browser regression requires the built extension and the Page Assist test
dependencies. `QWENPAW_TEST_PYTHON` overrides the test interpreter;
`QWENPAW_CHANNEL_DIR` overrides the plugin checkout path.

## More documentation

- Full product design and implementation plan: [English](docs/design.md) ·
  [简体中文](docs/design.zh-CN.md)
- Workspace architecture and coordination: [English](docs/architecture.md) ·
  [简体中文](docs/architecture.zh-CN.md)
- Shared API contracts: [English](contracts/README.md) ·
  [简体中文](contracts/README.zh-CN.md)

For the first release, the
[basic channel profile](contracts/README.md#first-release-basic-channel-profile)
overrides the full design: one Agent per dedicated in-process listener, with durable
recovery and browser approval cards deferred.

## Documentation language policy

Every Markdown document authored in this integration repository must have Chinese
and English versions. Keep the content synchronized and add reciprocal language
links near the top of both files. Use `README.md` / `README.zh-CN.md` for directory
entry pages, and `name.md` / `name.zh-CN.md` for other documents. Code, identifiers,
commands, and protocol field names remain unchanged across translations.

## License

This repository is licensed under the [Apache License 2.0](LICENSE).

It is an independent community integration and is not affiliated with or endorsed by
the Page Assist or QwenPaw projects. Upstream components keep their own terms: the
Page Assist fork remains MIT, QwenPaw is Apache-2.0, and the QwenPaw paw icon
bundled by the fork retains its Apache-2.0 notice.
