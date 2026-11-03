#!/usr/bin/env node
/**
 * Browser end-to-end check for the OpenClaw Page Assist channel.
 *
 * What this proves is the contract rather than the plugin's own view of it: the
 * shipped extension build talks to a real OpenClaw Gateway, lists the bound Agent,
 * sends a question, renders the reply, and — when the host gates a command — reads
 * the approval through `GET /approvals` and decides it through
 * `POST /approvals/:id/decision`. No route is mocked and no host is stubbed; the
 * only substitute is the model provider, which the Gateway under test is already
 * configured to use.
 *
 * The Gateway is not started here. It must already be running with the channel
 * plugin loaded, an Agent bound, and (for the approval phase) a provider that
 * emits one `exec` tool call when a turn carries the probe trigger.
 *
 *   PAGE_ASSIST_SERVICE=http://127.0.0.1:8767 PAGE_ASSIST_TOKEN=<token> \
 *     node scripts/openclaw-channel-browser.mjs
 *
 * or let it read both out of the Gateway's own config:
 *
 *   OPENCLAW_CONFIG=/path/to/openclaw.json node scripts/openclaw-channel-browser.mjs
 *
 * Optional environment:
 *   PAGE_ASSIST_DIR    extension checkout (default `../page-assist`); also where
 *                      `playwright` is resolved from, since this repo installs none
 *   PAGE_ASSIST_BUILD  unpacked extension to load (default `<PAGE_ASSIST_DIR>/build/chrome-mv3`)
 *   CHROME_PATH        Chromium-family executable (default Edge on Windows, google-chrome elsewhere)
 *   TOOL_PROBE         path to the provider's tool-probe JSON; when set, the approval
 *                      phase writes a trigger into it and expects the host to gate that command
 *   PROBE_TRIGGER      user text that makes the provider emit the tool call
 *   REPLY_CONTAINS     substring the first reply must carry (default: any non-empty reply)
 *   SCREENSHOT_PATH    write a PNG of the finished transcript
 *
 * Exits non-zero on the first failed assertion, and prints the sidebar's text so a
 * failure is read rather than guessed.
 */
import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { cp, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { platform, tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const workspace = path.resolve(here, "..", "..")
const pageAssistDir = process.env.PAGE_ASSIST_DIR || path.join(workspace, "page-assist")
const buildDir =
  process.env.PAGE_ASSIST_BUILD || path.join(pageAssistDir, "build", "chrome-mv3")
const chromePath =
  process.env.CHROME_PATH ||
  (platform() === "win32"
    ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    : "/usr/bin/google-chrome")

// The marker travels through the provider, the host's exec gate and back into the
// transcript, so it is what ties an approval click to a command that really ran.
const MARKER = "PAGE_ASSIST_BROWSER_PROBE"
const TRIGGER = process.env.PROBE_TRIGGER || "BROWSER APPROVAL PROBE"
// A command the host can resolve to a real executable, because one it cannot is
// refused outright and raises no approval to click.
const PROBE_COMMAND =
  platform() === "win32" ? `cmd /c echo ${MARKER}` : `echo ${MARKER}`

/** Reads the endpoint and the browser token, preferring explicit environment. */
function resolveTarget() {
  const service = process.env.PAGE_ASSIST_SERVICE
  const token = process.env.PAGE_ASSIST_TOKEN
  if (service && token) return { service: service.replace(/\/+$/, ""), token }
  const configPath = process.env.OPENCLAW_CONFIG
  if (!configPath) {
    throw new Error(
      "Set PAGE_ASSIST_SERVICE and PAGE_ASSIST_TOKEN, or OPENCLAW_CONFIG pointing at the Gateway config"
    )
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"))
  const channel = config?.channels?.["page-assist"]
  if (!channel?.browserToken) {
    throw new Error(`${configPath} has no channels.page-assist.browserToken`)
  }
  const port = channel.httpPort ?? 8767
  const host = channel.httpHost ?? "127.0.0.1"
  return { service: service ?? `http://${host}:${port}`, token: channel.browserToken }
}

const { service, token } = resolveTarget()
const headers = { authorization: `Bearer ${token}` }

/** One call against the endpoint under test, before any browser is involved. */
async function api(pathname) {
  const response = await fetch(`${service}/api/page-assist${pathname}`, { headers })
  const text = await response.text()
  return { status: response.status, text, json: text.startsWith("{") ? JSON.parse(text) : undefined }
}

// Preflight: a browser that cannot even read capabilities produces a wall of
// unrelated UI failures, so the two reads that define the profile are checked first.
const caps = await api("/capabilities")
assert.equal(caps.status, 200, `GET /capabilities -> ${caps.status} ${caps.text}`)
assert.equal(caps.json.approvals, true, "this endpoint must advertise approvals for this check")
assert.equal(caps.json.approvalEvents, false)
assert.equal(caps.json.recovery, false)
const agents = await api("/agents")
assert.equal(agents.status, 200, `GET /agents -> ${agents.status} ${agents.text}`)
const agent = agents.json.agents?.[0]
assert.ok(agent?.id, "the endpoint must name the Agent it is bound to")

/**
 * The sidebar's error alerts, and only those.
 *
 * `role="alert"` is not specific enough: the closed details drawer keeps its info
 * alert mounted, so counting roles reports an error that is not on screen.
 */
const errorAlerts = (page) => page.locator(".ant-alert-error")

const require = createRequire(path.join(pageAssistDir, "resolve.js"))
let chromium
try {
  ;({ chromium } = require("playwright"))
} catch {
  throw new Error(
    `playwright was not resolvable from ${pageAssistDir}; install the extension checkout's dependencies first`
  )
}
if (!existsSync(path.join(buildDir, "manifest.json"))) {
  throw new Error(`no unpacked extension at ${buildDir}; build the browser package first`)
}
if (!existsSync(chromePath)) {
  throw new Error(`no Chromium-family browser at ${chromePath}; set CHROME_PATH`)
}

const profile = await mkdtemp(path.join(tmpdir(), "page-assist-openclaw-browser-"))
const extension = path.join(profile, "extension")
let context
try {
  await cp(buildDir, extension, { recursive: true })
  context = await chromium.launchPersistentContext(profile, {
    executablePath: chromePath,
    headless: false,
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"]
  })
  const cdp = await context.browser().newBrowserCDPSession()
  const { id } = await cdp.send("Extensions.loadUnpacked", { path: extension })
  const origin = `chrome-extension://${id}`
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.setDefaultTimeout(30000)

  // The connection is written straight into extension storage: the point of this
  // check is the wire, not the settings form the QwenPaw harness already covers.
  await page.goto(`${origin}/manifest.json`)
  await page.evaluate(
    async ({ service, token }) => {
      localStorage.setItem("i18nextLng", "en")
      await chrome.storage.local.set({
        "qwenpaw.mode": JSON.stringify("remote"),
        "qwenpaw.connection": JSON.stringify({
          id: "openclaw-browser-check",
          baseUrl: service
        }),
        "qwenpaw.credential": JSON.stringify(token)
      })
    },
    { service, token }
  )
  await page.goto(`${origin}/sidepanel.html`)

  // The details drawer is where the browser states what it read off the endpoint,
  // so it doubles as the check that the connection resolved to this Gateway.
  await page.getByRole("button", { name: "Connection and chat details", exact: true }).click()
  await page.getByText(service, { exact: false }).waitFor()
  await page.getByRole("button", { name: "Close", exact: true }).click()

  // The approval control is rendered only for a channel that declares approvals, so
  // its presence is the capability reaching the UI, and it stays dark while nothing
  // is pending.
  const approvalButton = page.getByRole("button", { name: "Approvals", exact: true })
  assert.equal(await approvalButton.count(), 1, "the approvals control is missing")
  assert.equal(await approvalButton.isDisabled(), true, "nothing is pending yet")

  await page.getByRole("button", { name: /^Agent for new chat/ }).click()
  await page
    .getByRole("menuitem", { name: agent.name ?? agent.id, exact: true })
    .click()

  const question = page.getByPlaceholder("Ask the selected Agent…")
  const send = page.getByRole("button", { name: "Submit", exact: true })
  await question.fill("First question 中文")
  await send.click()
  await page.waitForFunction(() => document.querySelectorAll("article").length >= 2)
  await page.waitForFunction(() => !document.querySelector("textarea").disabled)
  const firstReply = (await page.locator("article").nth(1).innerText()).trim()
  assert.ok(firstReply.length > 0, "the reply rendered empty")
  if (process.env.REPLY_CONTAINS) {
    assert.ok(
      firstReply.includes(process.env.REPLY_CONTAINS),
      `reply does not contain ${process.env.REPLY_CONTAINS}: ${firstReply}`
    )
  }
  assert.equal(await errorAlerts(page).count(), 0, "the sidebar reported an error")

  if (process.env.TOOL_PROBE) {
    // The provider decides which turn raises a tool call, so the trigger goes in
    // with the question; the command itself is the one the host can resolve.
    writeFileSync(
      process.env.TOOL_PROBE,
      `${JSON.stringify(
        {
          trigger: TRIGGER,
          toolCall: { name: "exec", arguments: { command: PROBE_COMMAND } }
        },
        null,
        2
      )}\n`,
      "utf8"
    )
    await question.fill(`${TRIGGER}: run the probe command.`)
    await send.click()

    // The browser learns about the gate from its own five-second poll, so the wait
    // is bounded well past that rather than tied to one interval.
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Approvals"]')?.disabled,
      null,
      { timeout: 60000 }
    )
    assert.equal(await approvalButton.isDisabled(), false, "the pending approval never lit up")
    await approvalButton.click()
    const row = page.locator("article", { hasText: MARKER }).first()
    await row.waitFor()
    const rowText = await row.innerText()
    assert.ok(rowText.includes(PROBE_COMMAND), `the target is not the gated command: ${rowText}`)
    assert.ok(rowText.includes("Expires at"), `the row has no deadline: ${rowText}`)
    const approve = row.getByRole("button", { name: /^Approve/, exact: false })
    assert.equal(await approve.count(), 1, `expected exactly one approve scope: ${rowText}`)
    assert.equal(await row.getByRole("button", { name: "Reject", exact: true }).count(), 1)
    await approve.click()

    // A decided approval leaves the panel, which is the browser's own read of the
    // row being gone from `GET /approvals`.
    await page.waitForFunction(
      () => document.querySelector('button[aria-label="Approvals"]')?.disabled === true,
      null,
      { timeout: 60000 }
    )
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => !document.querySelector("textarea").disabled, null, {
      timeout: 120000
    })
    const transcript = await page.locator("article").last().innerText()
    assert.ok(
      transcript.includes(MARKER),
      `the approved command's output never reached the transcript: ${transcript}`
    )
    assert.ok(
      !/denied/i.test(transcript),
      `the transcript reports a refusal after an approval: ${transcript}`
    )
    assert.equal(await errorAlerts(page).count(), 0, "the sidebar reported an error")
  }

  if (process.env.SCREENSHOT_PATH) await page.screenshot({ path: process.env.SCREENSHOT_PATH })
  assert.deepEqual(errors, [])
  console.log(
    process.env.TOOL_PROBE
      ? "PASS: real extension -> real OpenClaw Gateway -> capabilities, Agent list, question and reply, gated command approved in the browser and its output back in the transcript"
      : "PASS: real extension -> real OpenClaw Gateway -> capabilities, Agent list, question and reply"
  )
} catch (error) {
  for (const page of context?.pages() ?? []) {
    console.error(
      "Browser diagnostic:",
      page.url(),
      (await page.locator("body").innerText()).slice(0, 4000)
    )
  }
  throw error
} finally {
  if (context) await context.close()
  await rm(profile, { recursive: true, force: true })
}
