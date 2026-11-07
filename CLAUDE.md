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
- **Rule 3.** Before finishing a stage run, in order, from the project root:
  `npm install`, `npm run format`, `npm run lint`, `npm run typecheck`,
  `npm test`, `cd src-tauri && cargo fmt --check && cd ..`,
  `cd src-tauri && cargo clippy --all-targets -- -D warnings && cd ..`,
  `cd src-tauri && cargo test && cd ..`,
  `npm run tauri build -- --debug --no-bundle`, `npm run e2e`.
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
