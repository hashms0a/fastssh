#!/usr/bin/env bash
# Stage gate (plan rule 3). Output is short; the details go to $LOG.
# Usage: tools/verify.sh quick            format, lint, types, unit tests (no build)
#        tools/verify.sh full [spec...]   + debug build, launch smoke, e2e specs
#        E2E_ALL=1 tools/verify.sh full   + the whole e2e suite (milestone stages)
set -uo pipefail
cd "$(dirname "$0")/.."
mode="${1:-quick}"; shift || true
T="${FASTSSH_TESTENV:-$HOME/fastssh-testenv}"
LOG=/tmp/fastssh-verify.log; : > "$LOG"
step() {
  local name="$1"; shift; local t0=$SECONDS
  printf '%-14s ' "$name"; echo "===== $name" >> "$LOG"
  if "$@" >> "$LOG" 2>&1; then echo "OK   $((SECONDS - t0))s"
  else echo "FAIL $((SECONDS - t0))s  (full output: $LOG)"; tail -n 40 "$LOG"; exit 1; fi
}
guard() {   # the owner's real files must not change (rule 10)
  local now; now=$(stat -c '%n %s %Y' ~/.ssh/config ~/.ssh/known_hosts \
                   ~/.config/easyssh/* ~/.config/fastssh/* 2>/dev/null || true)
  # The baseline is made on the first run. If the OWNER changed these files
  # on purpose, delete $T/realfiles.baseline to accept the change.
  [[ -f "$T/realfiles.baseline" ]] || echo "$now" > "$T/realfiles.baseline"
  diff <(echo "$now") "$T/realfiles.baseline"
}
smoke() {   # 8 s sandbox launch; the app must still be running at the end
  timeout 8 ./tools/dev-sandbox.sh debug > /tmp/fastssh-run.log 2>&1; local rc=$?
  cat /tmp/fastssh-run.log
  [[ $rc == 124 ]] || { echo "app exited early (code $rc)"; return 1; }
  ! grep -qiE 'panicked|not allowed|symbol lookup' /tmp/fastssh-run.log
}
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  step "npm install" npm install --no-audit --no-fund
fi
step "prettier"    npm run format
step "eslint"      npm run lint
step "tsc"         npm run typecheck
step "vitest"      npm test
step "cargo fmt"   bash -c 'cd src-tauri && cargo fmt'
step "clippy"      bash -c 'cd src-tauri && cargo clippy --all-targets -- -D warnings'
step "cargo test"  bash -c 'cd src-tauri && cargo test'
step "real files"  guard
[[ $mode == full ]] || { echo "quick verify: all OK"; exit 0; }
step "debug build" tools/build-debug.sh
step "smoke"       smoke
if [[ ${E2E_ALL:-0} == 1 ]]; then
  step "e2e (all)" npm run e2e
else
  for s in "$@"; do step "e2e $s" npx wdio run e2e/wdio.conf.ts --spec "e2e/specs/$s.e2e.ts"; done
fi
echo "full verify: all OK"
