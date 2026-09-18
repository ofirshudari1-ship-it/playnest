# Playnest

**Your entire game and software library, honestly organized.**

## What it does

Playnest is a Windows desktop app that scans your PC for installed games and applications — from Steam, Epic, the Windows registry, and manual installs outside any launcher — and brings them together into one unified, Netflix/Steam-style library. It filters out the junk a naive scanner would show you: installer/uninstaller stubs, duplicate entries for the same game seen by two different sources, and broken shortcuts that point at nothing. Your library appears the moment scanning finishes, with cover art (fetched from SteamGridDB) filling in afterward so the app never feels stuck waiting on a slow network call. Alongside the library, Playnest ships a small set of gaming tools — performance mode, a play-streak tracker, live system monitoring, analytics — and every one of them is backed by a real Windows API or real local data, never a decorative fake number. Everything runs locally on your machine; the only outbound network call it ever makes is to SteamGridDB for box art.

## Download & install

Get the latest installer from the GitHub Releases page:

**[Download the latest version](https://github.com/ofirshudari1-ship-it/playnest/releases/latest)**

1. Download `Playnest-Setup-<version>.exe` from the release's Assets.
2. Run the installer — choose English or Hebrew on the first screen.
3. Follow the setup wizard: pick an install location, then let it finish.
4. On first launch, Playnest runs a short setup wizard to scan your PC (skippable — you can run it again later from Settings).
5. Your library appears immediately; cover art fills in shortly after.

**System requirements:** Windows 10/11 (64-bit). No administrator rights required — if none are available, the installer automatically falls back to a per-user install instead of `Program Files`.

## Key features

- **Smart scanning** across Steam, Epic, the Windows registry, and an optional deep folder scan of chosen drives.
- **Only real, launchable entries** — installer/uninstaller executables and broken shortcuts are filtered out entirely.
- **Deduplication** by both name and install path, so the same game never shows up twice.
- **Fast startup, background artwork** — the library loads first, cover art streams in after.
- Fuzzy search, custom collections, favorites, and hidden items.
- **Automatic background rescan** (opt-in: daily or weekly) so newly installed titles show up without reopening the setup wizard.
- **"NEW" badges**, "most played" / "last played" sorting, and adjustable grid density (Compact / Comfortable / Large).
- **Global quick-launch hotkey** (`Ctrl+Shift+L`) to bring Playnest to the front from anywhere.
- **Performance Mode** — toggles the real Windows Game Mode setting and switches your actual power plan.
- **Streak Tracker, System Monitor, Analytics, Recommendations, and Game Insights** — all computed from real local data, never mocked.
- Full **bilingual English/Hebrew UI** with live RTL switching, and dark/light theme with automatic OS detection.
- The app won't open a second instance while one is already running — it just focuses the existing window.

## Automatic updates

Playnest checks GitHub for new versions automatically in the background and offers to install them for you (via electron-updater), so you don't need to manually re-download the installer for routine updates. You can always find the latest release yourself on the [Releases page](https://github.com/ofirshudari1-ship-it/playnest/releases).

## Privacy

Playnest is local-first: it never uploads your library, your files, or any usage data anywhere. The only network request it ever makes is to SteamGridDB, to fetch cover art for the titles it finds on your PC (using your own free API key, set in Settings). No accounts, no telemetry.
