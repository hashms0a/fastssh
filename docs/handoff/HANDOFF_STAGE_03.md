# HANDOFF — Stage 3 (library + editors), 2026-11-07 evening

Read BUILD_PLAN.txt first (1639 lines, the contract). Stage 1 handoff covers the
data layer, Stage 2 the shell. This file covers Stage 3 and the current state of
the suites.

## 1. Test-target environment (Linux box, user dev)

| thing         | value                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| config dir    | `~/fastssh-testenv/config` (hosts/accounts/bookmarks/settings.json)                                                                                                  |
| legacy dir    | `~/fastssh-testenv/legacy` (pristine copies: `cp ~/fastssh-testenv/legacy/*.json ~/fastssh-testenv/config/`)                                                         |
| seed library  | Local (local shell), web-1, web-2, db-server, item2, item10; accounts lab-key, lab-pass                                                                              |
| session-start | `pkill -x fastssh; sleep 1; (./src-tauri/target/debug/fastssh >/dev/null 2>&1 &); sleep 3; bash ~/fastssh-testenv/screenshot.sh docs/screenshots/stage_03/state.png` |
| display       | XWayland (GNOME) — window geometry jitters up to ~110 px; e2e asserts use ±120 px                                                                                    |

**Build trap:** `npm run tauri build -- --no-bundle` does NOT rebuild the frontend.
`npm run e2e` is now `npm run build && wdio run e2e/wdio.conf.ts`. A stale
`dist/assets/index-*.js` silently tests old code — check its mtime when results
look impossible.

## 2. Suite state (last full run, this session)

```
npm run format:check   clean
npm run lint           clean
npm run typecheck      clean
npm run test           82 passed (11 files: vitest node + jsdom)
cargo test             40 passed
npm run e2e            20 pass / 12 fail, 7 spec files
  library.e2e.ts        4 ✓  9 ✖   (the "web-1" chain, see §4)
  window.e2e.ts         3 ✓
  shell.e2e.ts          8 ✓  1 ✖   ("shows Local first, natural order…")
  smoke.e2e.ts          1 ✓
  storage.e2e.ts        3 ✓
  corrupt.e2e.ts        0 ✓  1 ✖   ("renames the 3 bad files, warns…")
  probe.e2e.ts          0 ✓  1 ✖   (one-off scratch probe, see §6)
```

## 3. Stage 3 acceptance list (plan §Stage 3) — where each item is verified

| #    | task                              | where                                                                                                                |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 3.1  | model helpers                     | `src/lib/hostUtils.ts` + `hostUtils.test.ts`                                                                         |
| 3.2  | normalize/validate                | `hostUtils.test.ts`, `sshConfigBlock.test.ts`                                                                        |
| 3.3  | ssh_config block                  | `src/lib/sshConfigBlock.ts` + tests (Forward lines, quoting, IPv6)                                                   |
| 3.4  | Connection editor                 | `src/components/Editors/ConnectionEditor.tsx` (Basic/Appearance/Tunnels/Advanced), `editors.test.tsx`, library e2e 1 |
| 3.5  | Account editor                    | `src/components/Editors/AccountEditor.tsx`, `editors.test.tsx`, library e2e 8-10                                     |
| 3.6  | inline validation                 | `ErrorRevealer.tsx`, `editors.test.tsx`, library e2e 2 (name/port)                                                   |
| 3.7  | live preview                      | `ConnectionEditor` ssh_config textarea `ssh-config-preview`, library e2e 4                                           |
| 3.8  | remove host (+tabs note)          | `editorActions.removeHost`, `editors.test.tsx`                                                                       |
| 3.9  | delete account unlinks            | `libraryActions.removeAccount`, library e2e 9                                                                        |
| 3.10 | Escape = Cancel                   | library e2e 6, `editors.test.tsx`                                                                                    |
| 3.11 | tunnels editor                    | `src/lib/tunnels.ts`, `TunnelsEditor.tsx`, `tunnels.test.ts`                                                         |
| 3.12 | optimistic save + rollback        | `librarySlice.ts` (save token), library e2e 11, storage e2e                                                          |
| 3.13 | e2e for add/edit/duplicate/remove | `e2e/specs/library.e2e.ts`                                                                                           |

All of the above exist and are covered by unit/jsdom tests. The e2e column shows
the _integration_ coverage; 9 of the library spec's 13 tests fail (chain, §4).

## 4. The remaining e2e work (this is what's left of Stage 3)

The library spec is one long chain on the seeded library; test 2's tail decides
tests 3-7. Current shape of test 2:

1. new connection, name `web-1` (duplicate) → banner + `error-name` "Name is
   already taken" → **passes**
2. port 70000 → `error-port` "1 and 65535" → **passes**
3. port 22, Add tunnel → row, type select → `-R` → preview shows `-R` → Save →
   expects `landing-name === "web-1"` → **fails: "Localhost"**

The last step is where to start: saving a new host sets the selection
(`ConnectionEditor.onSave` → `selectHost(next.id)`, added this session) and the
landing card follows `selectedHostId` (`WorkspaceEmptyState`). Two things to
check, in this order, with `npx wdio run e2e/wdio.conf.ts --spec
e2e/specs/library.e2e.ts` (add `await shot("stage_03","x.png")` to see state):

- a second host literally named `web-1` is created (the name is a label, the id
  is the key — plan §4.1), so the chain's later `web-1-copy` expectations need
  the copy of the _first_ row; and
- `upsertHost` matches by id, so a new host appends — the landing should follow.

`corrupt.e2e.ts` and `shell.e2e.ts`'s first test fail independently of the
chain; both are pure assertions on load order/warnings, so they are cheap to fix
after the chain (the shell one is likely the Local-group ordering after the
duplicate rows appear).

## 5. e2e helper conventions (learned the hard way)

- **CSS-first**: element handles from XPath selectors go stale on React render in
  this driver; `[data-testid="…"]` handles survive. `type()` uses CSS, attribute
  matching (e.g. `host-row[data-name]`) uses XPath via `xpathFor`.
- Tunnels: rules get stable ids from `parseTunnel(part, index)` (was `randomUUID`
  per parse, which remounted the row on every keystroke).
- Native `<select>`: use the `selectInPage(testid, value)` helper (value setter +
  `change` event); `selectByVisibleText` is flaky here.
- The tauri-service window-focus hook intermittently logs CDP `404 Not Found`;
  `mochaOpts.retries: 1` absorbs it. If a test fails on both attempts it is real.
- The toast stack (bottom right, `pointer-events-auto`) intercepts clicks near
  the editor's Save/Cancel; `dismissToasts()` runs in `beforeEach`.

## 6. Files touched this session (most recent work)

- `src/lib/tunnels.ts` — stable rule ids (`parseTunnel(part, index)`).
- `src/components/Editors/{ConnectionEditor,AccountEditor}.tsx` — after Save,
  `selectHost(id)` / `selectAccount(id)` so the landing card follows the save.
- `src/components/App.test.tsx` (new) — jsdom shell test: landing shows the first
  row, New Connection opens the overlay, sidebar click moves the card. Needs the
  `@tauri-apps/api/window` Proxy mock (copy from that file).
- `e2e/specs/library.e2e.ts` — CSS-first `type()`, `selectInPage`, tunnel steps.
- `e2e/wdio.conf.ts` — `mochaOpts.retries: 1`.
- `package.json` — `e2e` script now builds the frontend first.
- `docs/BUILD_PLAN.txt` §10 step 1 — same note.
- `e2e/specs/probe.e2e.ts` — currently a 1-test scratch probe ("save closes the
  editor"); replace with real probe coverage when fixing §4.

## 7. Suggested next steps

1. Fix §4's chain (test 2 tail → 3-7), then `corrupt.e2e.ts` and `shell.e2e.ts`
   test 1. Target: 32/32 e2e.
2. `git commit` after each green spec (HEAD: "Stage 3: e2e hardening…").
3. Stage 4 (terminal) needs its own handoff section afterwards: xterm.js +
   serde_json of PortableSession, 4 tabs, the 6-pane grid (R6 geometry),
   Ctrl+Tab order, 8-session memory, reconnect toast.
4. Keep the plan's rules: strings in `lib/strings.ts`, pure logic in `src/lib`
   with unit tests, `npm run format` before `npm run lint`.
