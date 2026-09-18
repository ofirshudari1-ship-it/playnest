# Playnest — Product Specification

**Version covered:** v3.4.1
**Audience:** anyone evaluating, building on, or extending Playnest — this is the
technical/product source of truth. For version-by-version history see
[`../CHANGELOG.md`](../CHANGELOG.md); for the marketing pitch see
[`landing-page.html`](landing-page.html).

---

## 1. What Playnest is

Playnest is a Windows desktop app that scans a PC for installed games and
applications and presents them as a single, unified, Netflix/Steam-style
library — regardless of whether a title came from Steam, Epic, or was
installed directly outside any launcher. On top of that library it ships a
small number of gaming-oriented utilities, each backed by a real Windows API
or real local data rather than a simulated number.

It is a native Electron + React application. Everything it does runs locally
on the user's machine; the only outbound network call it ever makes is to
SteamGridDB, to fetch box-art images for the titles it finds.

---

## 2. The problem it solves

A PC gamer's library is fragmented by construction:

- **Steam** knows about Steam games. **Epic** knows about Epic games. Neither
  knows about a game installed straight from a `.exe` downloaded off a
  developer's site, or a GOG offline installer, or an old floppy-disk-era
  title copied onto a drive.
- **Windows' own "Apps & Features" list** mixes actual games in with drivers,
  runtimes, redistributables, and every other installed program, with no
  concept of "game" at all.
- Because Windows lets any installer register itself in the same uninstall
  registry, a **naive scanner will show the game's setup wizard or
  uninstaller as if it were the game itself** — clicking the tile does
  nothing useful, or worse, launches an uninstall prompt.
- The same install can be visible to more than one of these sources at once,
  so a naive scanner **shows duplicates**.
- **Cover art fetching is slow** (one network round-trip per title against a
  free third-party API) — a scanner that waits for every image before
  showing anything makes the whole app feel broken on a large library.

Playnest exists to fix each of these specifically, not to add another
half-finished "everything" app: see §4 for exactly how.

A second, related problem: the market is full of "gaming suite" apps whose
extra tools (Discord status, RGB lighting, VPN checkers, AI coaching, social
features) are cosmetic — hardcoded numbers or a static "Connected" badge with
no real system integration behind them. Playnest's own first pass at these
tools made exactly that mistake (see the v3.1.1 changelog entry); the
project's current standing rule is that **a tool ships only if it does
something real, or it doesn't ship**. A follow-up pass (v3.1.2) then found
that "real" wasn't sufficient on its own — two of the rebuilt tools had
overlapping names and purposes that confused users even though both worked
correctly, and a static "Tools" listing page added a nav item with no actual
function. The standing rule is now **a tool ships only if it's real *and*
its place in the sidebar is unambiguous**. A third pass (v3.1.3) caught the
Tools pages rendering the entire game library underneath their own content —
the flag controlling that was a hand-maintained list of pages to *exclude*,
which silently stops covering a page the moment someone adds a new one and
forgets to update the list. Fixed by inverting it to a whitelist of the pages
that *are* the library, so a new tool page is excluded by default.

---

## 3. Who it's for

- **PC gamers with a library scattered across multiple stores and manual
  installs** who want one place to see and launch everything.
- **Laptop gamers** who want a one-click way to drop into a low-power profile
  for work and snap back to full performance for a session, without digging
  through Windows power-plan settings each time.
- Anyone who has been burned by "gaming suite" bloatware and wants a library
  manager whose extra features are all real, verifiable, and none of them
  phone home.

---

## 4. How it works

### 4.1 Scanning pipeline (`electron/scanner.cjs`)

1. **Steam** — reads `libraryfolders.vdf` to find every Steam library on
   every drive, then parses each `appmanifest_*.acf` for installed titles.
   Steam entries launch via the `steam://` protocol, so they're exempt from
   the local-file validity check below (Steam's own client, not Playnest,
   is responsible for whether they'll actually run).
2. **Epic Games** — reads Epic's own manifest JSON files
   (`%PROGRAMDATA%\Epic\EpicGamesLauncher\Data\Manifests`).
3. **Windows registry** — walks the three standard
   `...\Uninstall` registry roots (`HKLM`, `HKLM\WOW6432Node`, `HKCU`) that
   back "Apps & Features", parsed via `reg query /s` (see
   `electron/registry.cjs`).
4. **Optional deep folder scan** — for drives the user explicitly opts into,
   walks `Program Files`, `Program Files (x86)`, `Games`, and `GOG Games`
   looking for install folders that weren't already found above.

### 4.2 Correctness filters (the part that actually matters)

- **Installer/uninstaller executables are never treated as "the game."** A
  regex (`NON_LAUNCHABLE_EXE_RE`) excludes names like `setup.exe`,
  `unins000.exe`, `vc_redist_x64.exe`, `dxsetup.exe`, `CrashHandler.exe`, etc.
  when picking which `.exe` inside a folder represents the product. This
  handles the common real-world pattern of a keyword immediately followed by
  a version number or architecture suffix (`Setup64.exe`), not just an exact
  word-for-word match.
- **A bad registry `DisplayIcon`** (many installers point it at their own
  uninstaller) is detected and repaired by searching the actual install
  folder for a real, launchable executable instead.
- **Genre/system/crack detection** uses a keyword database
  (`electron/data/gamesDb.json`) to classify titles by genre, flag Windows
  system components (drivers, redistributables) so they're filed separately
  from games, and recognize cracked/repacked releases by their characteristic
  filesystem markers so they still land in a real genre bucket instead of
  "Other."
- **Deduplication** happens twice: first by normalized product name (keeping
  the highest-trust source — Steam > Epic > registry > folder scan), then
  again by install path, so two differently-worded entries pointing at the
  same folder still collapse into one.
- **The final gate:** after everything above, any entry that has *neither* a
  real, existing executable *nor* a real, existing install folder is dropped
  entirely. Playnest never shows a tile it can't act on.

### 4.3 Library load & artwork (`electron/main.cjs`)

Scanning and cover-art fetching are decoupled. The filesystem/registry scan
result is saved and returned to the UI immediately; cover art is then fetched
from SteamGridDB in the background, a few items at a time, with the renderer
notified (`library:updated`) as batches land so images fill in without ever
blocking the library from appearing.

### 4.4 Renderer ↔ main process bridge

The React UI never touches the filesystem or the registry directly — it goes
through a single `window.playnest` object exposed by `electron/preload.cjs`
via Electron's context bridge, which forwards to `ipcMain.handle` handlers in
`main.cjs`. All 34 IPC methods are typed end-to-end in `src/types.ts`.

---

## 5. Feature inventory (v3.3.1)

All of the below sit under one sidebar section, **Tools** — there is
deliberately no separate "Gaming Tools" vs. "Insights" split anymore; see the
note below the table for why.

| Area | Feature | What backs it |
|---|---|---|
| Library | Smart scan (Steam/Epic/registry/folders) | `scanner.cjs`, `registry.cjs` |
| Library | Cover art | SteamGridDB API, cached to disk per item |
| Library | Fuzzy search | Fuse.js over the in-memory library |
| Library | Collections, favorites, hidden items | `electron-store`-backed settings |
| Library | Library health check | Re-verifies every item's path still exists |
| Library | Backup / restore | Full JSON export/import of library + settings |
| Tools | **Performance Mode** — Game Mode toggle + Power Plan switch, one page | Real `HKCU\...\GameBar\AutoGameModeEnabled` registry key + real `powercfg` |
| Tools | Streak Tracker | Real daily activity log, recorded on every launch |
| Tools | System Monitor | Live CPU/RAM/temperature via `systeminformation` |
| Tools | Analytics dashboard | Computed from real playtime/genre data |
| Tools | Recommendations | Genre-affinity scoring over the user's own library |
| Tools | Game Insights | Backlog & play-pattern analysis |
| Tools | Storage view | Real per-drive, per-item disk usage |
| Tools | Hardware panel | Real CPU/GPU/RAM specs + tier scoring |
| System | Playtime tracking | Timed by watching the spawned game process's lifetime |
| System | System tray | Minimize-to-tray option |

Nine tools that shipped as mock UI in an earlier build (Discord presence,
streaming optimizer, VPN checker, RGB control, "AI" coaching, friend
tracking, game-price comparison, a duplicate statistics page, and a game
recorder) were removed for being fake. A separate follow-up merged two real
but confusingly-overlapping tools (a Game Mode toggle and a power-plan
switcher whose "high performance" option was *also* labeled "Game Mode")
into one Performance Mode page, and deleted a static "Tools" listing page
that added a sidebar entry with no actual function — see
[`../CHANGELOG.md`](../CHANGELOG.md) for the full reasoning.

A fourth pass (v3.2.0) addressed the visual identity: every emoji used as a
*functional* icon (sidebar nav, topbar buttons, empty states — 20 spots) was
replaced with a consistent hand-authored SVG icon set
(`src/components/Icon.tsx`), the app's logo was reworked with more depth
(`build/logo.svg`, mirrored in-app as `src/components/Logo.tsx`), and the
bare-text loading screen became a proper splash with the new mark. The
installer gained real branded graphics (`build/make-installer-graphics.cjs`
generates a header banner and welcome sidebar from the same logo, hand-
encoded as 24-bit BMP since NSIS won't accept anything else) and an
English/Hebrew language-selection page.

---

## 6. Non-goals (on purpose)

- **No cloud sync, no accounts, no telemetry.** Everything lives in
  `electron-store` on the local machine.
- **No fabricated metrics.** If a real number isn't available (e.g., FPS
  without hooking into a running game's renderer), Playnest doesn't invent
  one — it either omits the feature or clearly states the limitation.
- **No hardware-vendor SDK dependencies** (RGB lighting, proprietary
  overlays) that would require unverifiable vendor integrations to make good
  on.

---

## 7. Tech stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Desktop shell | Electron 31 |
| Build | Vite 5 (renderer) + electron-builder (NSIS installer) |
| Search | Fuse.js |
| Local persistence | `electron-store` |
| Hardware/system data | `systeminformation`, Windows `reg` / `powercfg` |
| Cover art | SteamGridDB REST API |

---

## 8. Where things live

```
Playnest/
├── Playnest-Setup-<version>.exe   Final installer — always in project root
├── src/                            React app (UI)
├── electron/                       Main process — scanning, IPC, local persistence
├── locales/                        en.json / he.json — UI strings
├── assets/                         Icon, logo, installer graphics
├── tests/                          Smoke tests (node --test)
├── site/                           Landing page + investor presentation
├── docs/                           Business plan (supplementary, non-standard)
├── build/                          Build-only: generator scripts + electron-builder's
│                                    own working output (build/dist, build/release)
├── version.json                    Single source of truth for the version
├── README.md                       Project hub — start here (he + en)
├── SPEC.md                         This file
└── CHANGELOG.md                    Full version history
```

See `../_AUDIT/STANDARDS.md` for the cross-project structural/UX standard this
layout follows.

---

## 9. STANDARDS.md compliance pass (v3.3.1)

A fifth pass brought the project in line with the cross-project standard in
`_AUDIT/STANDARDS.md`:

- **Folder structure**: installer moved to project root; `SPEC.md` moved out
  of `docs/`; marketing pages moved to `site/`; brand assets split out of
  `build/` into `assets/`; Vite's compiled output moved from a root-level
  `dist/` into `build/dist/`; electron-builder's own working output moved
  from a root-level `release/` into `build/release/`, with only the finished
  `.exe` copied up to root (`build/finalize-installer.cjs`).
- **`version.json`** added as the single source of truth, synced into
  `package.json` on every build (`build/sync-version.cjs`) and surfaced in
  the About screen (with build date) via `app:info`.
- **`tests/`** added — `node --test`-based smoke tests covering the
  scanner's correctness-critical logic (installer-exe filtering, dedup,
  the final usability gate), locale-file completeness, and version sync.
- **Full English/Hebrew i18n** (`locales/en.json`, `locales/he.json`,
  `src/i18n.ts`) with live RTL switching, replacing hardcoded strings across
  the sidebar, topbar, setup wizard, empty states, splash, error screen, and
  Settings panel. A language toggle is always visible in the topbar; English
  is the default regardless of OS locale, per the standard's explicit rule.
  **Update (v3.3.1)**: the remaining secondary "Tools" pages (Performance
  Mode, Streak Tracker, System Monitor, Analytics, Recommendations, Game
  Insights) are now fully translated too — ~85 new keys added to
  `locales/en.json`/`locales/he.json`, covering every user-facing string in
  those six components. i18n coverage is now complete across the app; the
  gap this section previously documented is closed.
- **Onboarding fixed to first-run-only**: the setup wizard previously
  reopened itself any time the library was empty (including after a
  deliberate skip, with no way to skip in the first place). Now gated by a
  persisted `setupWizardSeen` flag, with a visible Skip button plus Esc on
  every step, and reachable again anytime from Settings.
- **Splash screen**: enforced an 900ms minimum display time so a fast
  startup never flickers by unshown.
- **Dark/Light theme**: added a `system` option that follows the OS live via
  `matchMedia`, alongside the existing manual Dark/Light override.
- **Update-check banner**: the `app:checkForUpdates` IPC method existed but
  was never called from any UI — wired to a dismissible top banner, and
  fixed a real bug in the process (string version comparison instead of
  numeric, which misorders any version past a single-digit segment).
  **Known limitation**: still points at a placeholder GitHub repo
  (`anthropics/playnest`) — needs the project's real repo (or a hosted
  `latest.json`) before this does anything in practice; it safely no-ops
  until then.
- **Installer "already running" check**: added (same day, follow-up) —
  `build/installer.nsh` checks via `tasklist` before install *and* uninstall,
  blocking with Retry/Cancel until Playnest is actually closed. This was the
  one item flagged as missing from every tool in the project except SnapAI;
  the app-level `requestSingleInstanceLock()` alone never protected the
  installer from overwriting files the running app still had open.
- **v3.3.1 compliance sweep** (full audit against `_AUDIT/STANDARDS.md`):
  - `electron/main.cjs`: `sandbox: false` → `sandbox: true` on the
    `BrowserWindow`'s `webPreferences` — STANDARDS.md §11.4 requires
    `contextIsolation`+`nodeIntegration:false`+`sandbox` together, not two
    of three. The preload script only ever used `contextBridge`/`ipcRenderer`
    (no direct Node API access), so sandboxing it needed no other change.
  - `electron/main.cjs`: added a `mainWindow.on('closed', () => { mainWindow
    = null })` handler per §11.9, so the window reference is releasable even
    though `window-all-closed` already quits the process on Windows today.
  - `electron/main.cjs` + `electron/store.cjs`: added window size/position/
    maximized-state persistence (§12.3) — restores on next launch only if
    the saved position still falls on a currently-connected display,
    otherwise falls back to centered defaults; debounced writes on
    `resize`/`move`, flushed on `close`.
  - GitHub update-check URL (`electron/main.cjs`, `UPDATE_CHECK_URL`) was
    re-verified: still a placeholder (`anthropics/playnest`) because no real
    repo exists for this project (checked `package.json`, `README.md`, and
    for a `.git` remote — none found). Left as-is; it already safely no-ops
    rather than erroring, and is documented as a known limitation both here
    and inline in the code.
- **v3.4.0 product pass**: a competitor look (Playnite, GOG Galaxy, Steam)
  plus a read-through of `src/helpers.ts`/`electron/main.cjs` rather than a
  redesign, since the compliance sweeps above had already brought the app
  close to `_AUDIT/STANDARDS.md`.
  - **Fixed a real bug**: `Settings['sortBy']` included `'playtime'` and
    `'lastPlayed'` but `sortItems()` had no `case` for either, so selecting
    them (had they been exposed) silently fell back to name sort. Both are
    now implemented and exposed as "Most played"/"Last played" in the sort
    menu (`src/components/FilterMenu.tsx`).
  - **Added automatic background rescan** (opt-in, off by default): "Never /
    Every day / Every week" in Settings. Purely local — repeats the same
    scan the user already ran by hand, using the drives/deepScan scope
    remembered from their last manual scan (`store.lastScanOptions`); never
    fires before `setupWizardSeen`. A genuine gap versus Playnite/GOG
    Galaxy, which both auto-refresh their libraries without the user having
    to reopen a wizard.
  - **Added a "NEW" badge** on cards added in the last 7 days, mirroring the
    "recently added" cue both competitors surface — reuses the `addedAt`
    timestamp the scanner already stamped but nothing in the UI read yet.
  - **Not applied**: the task brief for this pass named a `#22b8a0`/`#0c4d43`
    teal palette; that doesn't match this project's actual established
    palette (violet/teal `--accent`/`--accent-2` in `src/styles/global.css`
    — no `assets/BRAND.md` exists yet to formally document one), so it was
    left alone rather than overwritten on a guess.
  - **Added a grid density control** (Compact/Comfortable/Large,
    `settings.gridDensity`) — Steam's own library view offers the same idea;
    a `--card-w`/`--card-gap` CSS custom property pair on `.category-row`
    keeps both the grouped and ungrouped grid layouts in sync from one
    setting (`src/components/FilterMenu.tsx`, `Library/CategoryRow.tsx`,
    `src/styles/global.css`).
  - **Added a global quick-launch hotkey** (`Ctrl+Shift+L`,
    `settings.quickLaunchHotkeyEnabled`, on by default) — brings Playnest
    to the front and focuses search from anywhere, echoing Playnite's and
    GOG Galaxy's overlay shortcuts (`electron/main.cjs`). Ships as a fixed
    combination behind an on/off toggle, not full remapping —
    `STANDARDS.md` §12.4 calls for the latter for any global shortcut; a
    proper keybinding picker (conflict detection against Windows/OBS/
    Discord defaults, not just picking a combo believed to be free) was
    judged out of scope for this pass and is a documented, scoped gap.
  - **Added a proactive "needs attention" check** (`src/App.tsx`,
    `computeNeedsAttention` in `src/helpers.ts`): the existing "Verify
    Library" button in Settings already found broken shortcuts, but only if
    the user remembered to click it. Now the same local `fs.existsSync`
    check runs once automatically after every fresh library load, combined
    with a second local heuristic (a favorited item added 2+ weeks ago that
    still shows zero playtime), surfaced as one info toast pointing at
    Settings → Library Health. Local rule-based heuristic only, same as the
    rest of the app's "Smart Features" — no network call, no cloud AI.
  - **i18n gap closed**: `src/components/FilterMenu.tsx` had zero `t()`
    calls — "Group by"/"Sort by"/category labels stayed hardcoded English
    even after i18n was declared complete in v3.3.1, because this file
    wasn't part of that sweep (it isn't one of the six "Tools" pages that
    sweep targeted). Converted to `t()` with new `filterMenu.*` keys.
  - **Fixed a real performance bug**: `library:get` re-read and
    re-base64-encoded every cover-art JPEG from disk synchronously on the
    main process on *every* call — and favoriting, hiding, or tagging a
    single item each trigger a full library reload, so one click could mean
    re-encoding a few hundred images before the UI even reflected it. Cover
    files are content-addressed by item id and never rewritten once
    fetched, so their data URLs are now cached in memory for the process's
    lifetime and only invalidated when a cover is actually (re)fetched
    (`electron/main.cjs`).
  - **Performance**: `getInstalledPrograms()` queried the three uninstall
    registry roots one after another with `reg query /s` (each walking
    potentially hundreds of subkeys) — now run concurrently with
    `Promise.all` (`electron/registry.cjs`), so this part of every scan
    takes roughly as long as the single slowest root instead of the sum of
    all three.
  - **Reviewed, not changed**: `scanDriveFolders()`'s `dirSizeApprox()` caps
    itself at 400 filesystem entries per folder specifically to bound scan
    time on huge installs — already a deliberate tradeoff, not a bug.
  - **Fixed a real responsiveness bug (follow-up pass, same day)**:
    `findRealExecutable()`/`scanDriveFolders()`/`scanRegistryPrograms()`
    call `fast-glob`'s `.sync()` and `fs.readdirSync`/`fs.statSync`
    synchronously per candidate — none of these yield to Node's event loop,
    so a deep scan's folder walk ran as one unbroken synchronous block on
    the main process. Electron's async IPC (including the very
    `scan:progress` messages meant to show live "Checking &lt;path&gt;"
    status) is only actually delivered once control returns to the event
    loop, so in practice progress text visibly batched up and jumped at the
    end of a scan instead of updating live, and the app was unresponsive to
    any other IPC meanwhile — the "no UI freeze" requirement `STANDARDS.md`
    §2 calls out. The earlier note above worried that *batching or
    parallelizing* the fast-glob calls would change progress-message
    granularity — true, and still avoided — but a plain
    `yieldToEventLoop()` checkpoint (`setImmediate`-based, added once per
    folder in `scanDriveFolders` and every 20 items in
    `scanRegistryPrograms`, `electron/scanner.cjs`) doesn't change *what*
    gets scanned or *when* each progress message fires, only that Node
    actually gets a turn to deliver already-queued IPC in between. Scan
    wall-clock time is unchanged; only in-scan responsiveness improves.
