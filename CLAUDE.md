# FastSSH

Tauri v2 (Rust + React/TypeScript) SSH connection manager and terminal
multiplexer for Ubuntu (GNOME) and Kubuntu (KDE Plasma), shipped as an AppImage.

## For agents and contributors

1. Read `docs/BUILD_PLAN.txt` (the staged build plan) first.
2. Then read the newest file in `docs/handoff/` — the handoff is the source
   of truth for **what exists**; the plan is the source of truth for **what
   to build next**. If they disagree about what exists, believe the handoff
   and check the code.
3. `docs/SPEC.md` is the product spec. Where the plan records a deviation
   (see its "Deviations" handoff sections), **the plan wins**.

Key rules (verbatim from the plan):

- **Rule 2.** Do ONLY the stage you were asked to do. Change earlier code
  only when the current stage needs it. Record each such change under
  "Deviations" in the handoff.
- **Rule 3.** Testing is TIERED. Never run more than the current tier needs.
  a) _While working_: only the fast checks for what you touched
  (`npx vitest run src/lib/tunnels.test.ts`, `npm run typecheck`,
  `cd src-tauri && cargo check`, `cargo test tunnels`). No clippy, no
  `tauri build`, no `npm install`, no e2e in this loop.
  b) _Stage gate_ (once, after the stage's tasks are written):
  `tools/verify.sh full <spec>` (e.g. `tools/verify.sh full library`);
  `tools/verify.sh quick` for a mid-stage sanity check; at milestone
  stages (Test Matrix, plan Section 4) `E2E_ALL=1 tools/verify.sh full`.
  On FAIL, fix and re-run only that step's command; run the gate once
  more at the end.
  c) _Acceptance_: prove each bullet the way its tag says (Section 10).
  Do not re-check by hand what the tests already cover.
- **Rule 10.** Safety: NEVER run sudo, apt, rustup or global npm installs.
  Never uninstall software, delete caches, pull Docker images, or upgrade
  any toolchain without asking the owner first. Protect the owner's real
  data: you MUST NOT write, move or reformat `~/.ssh/config`,
  `~/.ssh/known_hosts`, `~/.config/easyssh/` or `~/.config/fastssh/`. Every
  manual run and every test uses the sandbox variables `FASTSSH_CONFIG_DIR`,
  `FASTSSH_SSH_DIR` and `FASTSSH_LEGACY_DIR` (plan Section 10).
- **Rule 11.** Git: the repository is `fastssh/`. At the end of each stage,
  run `git add -A && git commit -m "Stage NN: <title>"`. Never commit
  private keys, the sandbox, or `target/` and `node_modules/`.

- **Rule 12.** Never guess what the UI looks like, but never screenshot
  something a test can assert. At most 2 screenshots per stage (Stage 12
  excepted), only of NEW visible UI; open each PNG and describe it in one
  line in the handoff. Otherwise list visual checks as [human] items.
- **Rule 13.** Time-box: after 3 focused fix attempts (about 45 minutes) on a
  failing check, stop, record it under "Known issues" with what you tried
  and your best guess, mark that bullet FAIL and continue the stage. Never
  rewrite working earlier-stage code to chase one failing check.
- **Rule 14.** Do not repeat work. Do not re-run a check that passed in this
  session unless the code it covers changed. Do not re-verify earlier stages
  unless the Test Matrix marks this stage as a milestone.
