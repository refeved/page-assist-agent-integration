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
against the same fixtures in workspace-level tests. Do not introduce a second
runtime service or make either product repository depend on this repository at
runtime.
