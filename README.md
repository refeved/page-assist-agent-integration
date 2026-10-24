# QwenPaw + Page Assist

[简体中文](README.zh-CN.md) | English

This repository coordinates the QwenPaw server integration and the Page Assist
browser extension in one reproducible west workspace.

## Documentation language policy

Every Markdown document authored in this integration repository must have
Chinese and English versions. Keep the content synchronized and add reciprocal
language links near the top of both files. Use `README.md` /
`README.zh-CN.md` for directory entry pages, and `name.md` /
`name.zh-CN.md` for other documents. Code, identifiers, commands, and protocol
field names remain unchanged across translations.

The workspace contains three independent Git repositories:

| Path | Role |
| --- | --- |
| `integration/` | This repository: west manifest, architecture, shared API contracts, and cross-repository checks |
| `qwenpaw/` | QwenPaw server, including the in-process Page Assist module |
| `page-assist/` | Page Assist fork, including the remote QwenPaw UI and transport |

The two product repositories are west projects, **not Git submodules**. `west.yml`
is the source of truth for their URLs and revisions. Do not also add them to
`.gitmodules`.

## Baseline

The manifest pins the analyzed stable releases:

- QwenPaw `2.2.2.post1`, commit `b6715daabaa4f966626317452980fb84b8be9ab9`
- Page Assist `v1.5.88`, commit `ad6ef90a9b4b860bbdfc81ee82111c8e04502c65`

The manifest initially uses the official upstream URLs because personal or
organization fork URLs have not yet been provided. Before pushing product
changes or sharing this workspace, create forks and update the `url` entries in
`west.yml`. Keep revisions pinned to commits available from those forks.

## Initialize

From a clone of this repository:

```bash
west init -l integration
west update
west list
```

The `.west/` directory is created beside `integration/`; the product checkouts
appear at `qwenpaw/` and `page-assist/`.

In this already initialized workspace, update projects after changing `west.yml`
with:

```bash
west update
```

West checks out each manifest revision in detached-HEAD state. Before making
changes, create a feature branch in the relevant product checkout. Do not use
`west update` to manage uncommitted work.

## Development boundaries

- Implement server behavior only in `qwenpaw/`; the integration runs inside the
  QwenPaw process. Do not add a separate Bridge service.
- Implement browser UI, page snapshotting, and remote transport only in
  `page-assist/`.
- Define shared HTTP and SSE behavior in `contracts/` before implementing
  cross-repository changes.
- Put orchestration, cross-repository tests, and release composition here.
- Keep credentials, real user data, and generated artifacts out of Git.

See [docs/architecture.md](docs/architecture.md) for the ownership and
coordination model, and [contracts/README.md](contracts/README.md) for the
contract authoring guidance.

The full product design and implementation plan is available in
[English](docs/design.md) and [Chinese](docs/design.zh-CN.md).

Chinese versions: [工作区架构](docs/architecture.zh-CN.md) ·
[共享 API 契约](contracts/README.zh-CN.md).
