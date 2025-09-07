#!/usr/bin/env bash
set -euo pipefail

#############################################
# EDIT THESE FOR YOUR SETUP
#############################################
REPO_DIR="/home/pi/discord-bot"         # path to the git repo root (where docker-compose.yml lives)
BRANCH="main"                           # main branch name (use "master" if your repo uses that)
SERVICE_NAME="discord-bot"              # docker compose service name
CHANGELOG_FILE="${REPO_DIR}/CHANGELOG.auto.md"  # where to log updates
WAIT_SECONDS=25                         # wait after (re)start to decide if it launched ok
LOCK_FILE="/tmp/${SERVICE_NAME}-update.lock"

#############################################
# Helpers
#############################################
ts() { date +"%Y-%m-%d %H:%M:%S %Z"; }

log() {
  printf "[%s] %s\n" "$(ts)" "$*" | tee -a "$CHANGELOG_FILE"
}

# Pick compose command (supports older docker-compose too)
compose() {
  if command -v docker &>/dev/null && docker compose version &>/dev/null; then
    docker compose -f "${REPO_DIR}/docker-compose.yml" "$@"
  else
    docker-compose -f "${REPO_DIR}/docker-compose.yml" "$@"
  fi
}

is_running() {
  docker inspect -f '{{.State.Running}}' "$SERVICE_NAME" 2>/dev/null | grep -qi true
}

#############################################
# Acquire lock so only one run happens
#############################################
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another update run is in progress. Exiting."
  exit 0
fi

#############################################
# Go to repo & fetch latest
#############################################
cd "$REPO_DIR"

# Ensure clean working tree (we will discard local changes)
git reset --hard >/dev/null
git clean -fd >/dev/null

# Fetch/pick default branch (override via BRANCH variable)
git fetch --all --prune --quiet
if ! git rev-parse --verify "origin/${BRANCH}" >/dev/null 2>&1; then
  log "Branch origin/${BRANCH} not found. Aborting."
  exit 1
fi

CURRENT_COMMIT="$(git rev-parse HEAD)"
REMOTE_COMMIT="$(git rev-parse "origin/${BRANCH}")"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "No updates on ${BRANCH}. Current commit: ${CURRENT_COMMIT:0:7}"
  exit 0
fi

log "Updates found on ${BRANCH}: ${CURRENT_COMMIT:0:7} → ${REMOTE_COMMIT:0:7}"
log "Commits:"
git --no-pager log --oneline --no-decorate "${CURRENT_COMMIT}..origin/${BRANCH}" | tee -a "$CHANGELOG_FILE"

#############################################
# Stop container, pull, rebuild, restart
#############################################
log "Stopping container ${SERVICE_NAME}…"
# Use stop to keep network mode host clean; if service not running, ignore error
docker stop "${SERVICE_NAME}" >/dev/null 2>&1 || true

log "Resetting to remote and pulling…"
git checkout -q "$BRANCH"
git reset --hard "origin/${BRANCH}" >/dev/null

log "Starting container (rebuild)…"
compose up -d --build

# Give the container time to boot
sleep "$WAIT_SECONDS"

if is_running; then
  log "✅ Launch OK at commit ${REMOTE_COMMIT:0:7}"
  exit 0
fi

#############################################
# Rollback flow on failure
#############################################
log "❌ Launch FAILED after update. Rolling back to ${CURRENT_COMMIT:0:7}…"

# Stop failed container (if it exists at all)
docker stop "${SERVICE_NAME}" >/dev/null 2>&1 || true

# Reset repo back
git reset --hard "${CURRENT_COMMIT}" >/dev/null

log "Starting container with rolled-back code…"
compose up -d --build
sleep "$WAIT_SECONDS"

if is_running; then
  log "🔁 Rollback SUCCESS. Service running at ${CURRENT_COMMIT:0:7}."
  log "NOTE: Update to ${REMOTE_COMMIT:0:7} failed to launch; investigate logs and dependencies."
  exit 0
else
  log "🛑 Rollback FAILED — service still not running. Check 'docker logs ${SERVICE_NAME}' and system status."
  exit 2
fi
