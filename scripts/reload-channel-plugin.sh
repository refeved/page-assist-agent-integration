#!/usr/bin/env bash
# Reload the Page Assist channel plugin into a running QwenPaw host and verify
# that the channel rebound its port with the new code.
#
# Why this script exists: `qwenpaw plugin install --force` hot-reloads the
# plugin while QwenPaw is running, but the channel binds its listener once and
# never retries. The previous channel instance can keep the port just long
# enough that the new instance fails with
# "OSError: [Errno 98] address already in use", while the CLI still prints
# success and the stale socket keeps answering requests. A plain "is the port
# open?" check therefore reports a healthy channel even when the new code never
# started. This script compares the listening socket inode around the reload,
# waits for the stale socket to be released, retries the install, and can fall
# back to a host restart that frees the port.
#
# Exit codes: 0 reloaded and serving, 1 preflight failure, 2 reload did not take.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
WORKSPACE_ROOT=$(cd -- "${SCRIPT_DIR}/../.." && pwd)

PLUGIN_DIR=${PLUGIN_DIR:-"${WORKSPACE_ROOT}/qwenpaw-channel-page-assist"}
PLUGIN_ID=${PLUGIN_ID:-page-assist}
CHANNEL_PATH=${CHANNEL_PATH:-/api/page-assist/capabilities}
UNIT=${UNIT:-qwenpaw.service}
HOST_ADDR=${PA_CHANNEL_HOST:-127.0.0.1}
PORT=${PA_CHANNEL_PORT:-8766}
ATTEMPTS=${RELOAD_ATTEMPTS:-3}
WAIT_SECS=${RELOAD_WAIT_SECS:-25}
RELEASE_SECS=${RELOAD_RELEASE_SECS:-20}
RESTART=${RESTART_CHANNEL_HOST:-0}
QUIET=${QUIET:-0}

log() {
  [[ ${QUIET} -eq 1 ]] || printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Reload the Page Assist channel plugin into a running QwenPaw host.

Options:
  --plugin-dir PATH   Plugin checkout to install. Default: <workspace>/qwenpaw-channel-page-assist
  --qwenpaw-bin PATH  qwenpaw executable. Default: $QWENPAW_BIN, then PATH, then
                      $HOME/qwenpaw/.venv/bin/qwenpaw
  --host ADDR         Channel address to probe. Default: 127.0.0.1
  --port N            Channel port to probe. Default: 8766
  --attempts N        Reload attempts before giving up. Default: 3
  --wait SECS         Seconds to wait for the new listener per attempt. Default: 25
  --release SECS      Seconds to wait for the stale listener to free the port.
                      Default: 20
  --restart           If reloading never takes, restart the host service (needs sudo),
                      which frees the port, then verify again
  --unit NAME         Systemd unit name. Default: qwenpaw.service
  --quiet             Reduce progress output
  -h, --help          Show this help

Environment overrides: PLUGIN_DIR, QWENPAW_BIN, PA_CHANNEL_HOST, PA_CHANNEL_PORT,
RELOAD_ATTEMPTS, RELOAD_WAIT_SECS, RELOAD_RELEASE_SECS, RESTART_CHANNEL_HOST, QUIET.

Exit codes: 0 reloaded and serving, 1 preflight failure, 2 reload did not take.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin-dir) PLUGIN_DIR=$2; shift 2 ;;
    --qwenpaw-bin) QWENPAW_BIN=$2; shift 2 ;;
    --host) HOST_ADDR=$2; shift 2 ;;
    --port) PORT=$2; shift 2 ;;
    --attempts) ATTEMPTS=$2; shift 2 ;;
    --wait) WAIT_SECS=$2; shift 2 ;;
    --release) RELEASE_SECS=$2; shift 2 ;;
    --restart) RESTART=1; shift ;;
    --unit) UNIT=$2; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done

resolve_qwenpaw() {
  if [[ -n ${QWENPAW_BIN:-} ]]; then
    printf '%s' "${QWENPAW_BIN}"
  elif command -v qwenpaw >/dev/null 2>&1; then
    command -v qwenpaw
  elif [[ -x "${HOME}/qwenpaw/.venv/bin/qwenpaw" ]]; then
    printf '%s' "${HOME}/qwenpaw/.venv/bin/qwenpaw"
  else
    return 1
  fi
}

host_is_running() {
  pgrep -f 'bin/qwenpaw app' >/dev/null 2>&1
}

# Socket inode of the current listener, empty when nothing holds the port.
# A changed inode proves a different socket bound the port after the reload.
listener_inode() {
  ss -ltnHe "sport = :${PORT}" 2>/dev/null | grep -oE 'ino:[0-9]+' | head -1 |
    cut -d: -f2 || true
}

channel_answers() {
  local code
  code=$(curl -s -o /dev/null --max-time 5 -w '%{http_code}' \
    "http://${HOST_ADDR}:${PORT}${CHANNEL_PATH}" 2>/dev/null || true)
  [[ -n ${code} ]] || code=000
  # 401 means the listener is up and authentication is enforced; 200 means the
  # host answered without a challenge. Anything else counts as not serving.
  [[ ${code} == 401 || ${code} == 200 ]]
}

# Wait until a *new* socket owns the port and answers. $1 is the inode captured
# before the reload.
wait_for_rebind() {
  local before=$1 limit=${2:-${WAIT_SECS}} current
  local deadline=$((SECONDS + limit))
  while (( SECONDS < deadline )); do
    current=$(listener_inode)
    if [[ -n ${current} && ${current} != "${before}" ]] && channel_answers; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_release() {
  local before=$1
  local deadline=$((SECONDS + RELEASE_SECS))
  while (( SECONDS < deadline )); do
    if [[ $(listener_inode) != "${before}" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

log_channel_failure() {
  command -v journalctl >/dev/null 2>&1 || return 0
  journalctl -u "${UNIT}" --since "-5 minutes" --no-pager -o cat 2>/dev/null |
    grep -iE "failed to start channel=page_assist|Errno 98" | tail -2 || true
}

version_of() {
  local manifest=$1
  [[ -f ${manifest} ]] || { printf 'unknown'; return; }
  grep -m1 '"version"' "${manifest}" | sed -E 's/.*": *"([^"]+)".*/\1/'
}

QWENPAW=$(resolve_qwenpaw) || die \
  "qwenpaw executable not found; pass --qwenpaw-bin or set QWENPAW_BIN"
[[ -d ${PLUGIN_DIR} ]] || die "plugin directory not found: ${PLUGIN_DIR}"
[[ -f ${PLUGIN_DIR}/plugin.json ]] || die "no plugin.json in ${PLUGIN_DIR}"
command -v ss >/dev/null 2>&1 || die "ss(1) is required to verify the listener"
command -v curl >/dev/null 2>&1 || die "curl(1) is required to probe the channel"

INSTALLED_MANIFEST="${HOME}/.qwenpaw/plugins/${PLUGIN_ID}/plugin.json"
log "host     : $(if host_is_running; then printf 'running'; else printf 'not running'; fi)"
log "qwenpaw  : ${QWENPAW}"
log "plugin   : ${PLUGIN_DIR} ($(git -C "${PLUGIN_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout'), version $(version_of "${PLUGIN_DIR}/plugin.json"))"
log "channel  : http://${HOST_ADDR}:${PORT}${CHANNEL_PATH}"
log "installed: version $(version_of "${INSTALLED_MANIFEST}")"

# A stopped host only needs the files installed; the channel binds at startup.
if ! host_is_running; then
  "${QWENPAW}" plugin install "${PLUGIN_DIR}" --force || die "install command failed"
  log "installed version $(version_of "${INSTALLED_MANIFEST}"); the channel loads when ${UNIT} starts"
  if [[ ${RESTART} == 1 ]]; then
    log "--- starting ${UNIT} ---"
    sudo systemctl start "${UNIT}" || die "could not start ${UNIT}"
    if wait_for_rebind "" $((WAIT_SECS * 3)); then
      log "OK: channel is serving on ${HOST_ADDR}:${PORT}"
      exit 0
    fi
    log_channel_failure
    die "channel is not serving after starting ${UNIT}"
  fi
  exit 0
fi

attempt=1
while (( attempt <= ATTEMPTS )); do
  before=$(listener_inode)
  log "--- reload attempt ${attempt}/${ATTEMPTS} (listener inode: ${before:-none}) ---"
  "${QWENPAW}" plugin install "${PLUGIN_DIR}" --force >/dev/null ||
    log "install command reported failure"

  if wait_for_rebind "${before}"; then
    log "OK: channel rebound ${HOST_ADDR}:${PORT}; installed version $(version_of "${INSTALLED_MANIFEST}")"
    exit 0
  fi

  log "the port is still held by the pre-reload socket; the new channel could not bind"
  log_channel_failure

  if (( attempt < ATTEMPTS )) && wait_for_release "${before}"; then
    log "previous listener released the port, retrying"
  elif (( attempt < ATTEMPTS )); then
    log "port was not released within ${RELEASE_SECS}s, retrying anyway"
  fi
  attempt=$((attempt + 1))
done

if [[ ${RESTART} == 1 ]]; then
  log "--- falling back to restarting ${UNIT} to free the port ---"
  sudo systemctl restart "${UNIT}" || die "could not restart ${UNIT}"
  if wait_for_rebind "" $((WAIT_SECS * 3)); then
    log "OK: channel is serving after the host restart; installed version $(version_of "${INSTALLED_MANIFEST}")"
    exit 0
  fi
  log_channel_failure
  die "channel still not serving after restarting ${UNIT}"
fi

printf 'error: hot reload did not take effect. The stale channel keeps the port,\nso a host restart is required:\n' >&2
printf '  sudo systemctl restart %s\n' "${UNIT}" >&2
printf '  %s --restart\n' "$0" >&2
printf 'or inspect: journalctl -u %s -n 100\n' "${UNIT}" >&2
exit 2
