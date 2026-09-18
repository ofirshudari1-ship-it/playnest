# Playnest v3.4.1

**Your entire game and software library, honestly organized.**

A Windows desktop app that scans your PC for installed games and applications,
organizes them into a Netflix/Steam-style library, and gives you a small set
of tools that all do something real — no mock data, no decorative toggles.

---

## עברית

**כל ספריית המשחקים והתוכנות שלך, מאורגנת בכנות.**

Playnest היא תוכנת שולחן עבודה ל-Windows שסורקת את המחשב שלך, מאתרת כל
משחק ותוכנה מותקנים (Steam, Epic, רישום Windows, והתקנות ידניות), ומארגנת
הכול בספרייה אחת בסגנון Netflix/Steam. לצד הספרייה יש קבוצה קטנה של כלים —
וכל אחד מהם עושה משהו אמיתי על המחשב שלך, לא רק ממשק יפה.

### התקנה
1. הורידו את `Playnest-Setup-3.4.1.exe` משורש הפרויקט.
2. הריצו את קובץ ההתקנה — בעמוד הראשון תוכלו לבחור עברית או אנגלית.
3. עקבו אחר האשף: מיקום התקנה, קיצורי דרך, ולבסוף התקנה.
4. בהפעלה הראשונה, Playnest תריץ אשף התקנה קצר שיסרוק את המחשב שלכם —
   אפשר לדלג עליו בכל שלב (Esc או כפתור "דילוג") ולהריץ אותו מאוחר יותר
   דרך ההגדרות.

### שימוש
- **ספרייה**: כל המשחקים והתוכנות שנמצאו, עם סינון וחיפוש.
- **כלים**: מצב ביצועים אמיתי (Windows Game Mode + תוכניות צריכת חשמל),
  מעקב רצף משחק, ניטור מערכת חי, אנליטיקה, המלצות, ותובנות משחק.
- **הגדרות**: מראה (כהה/בהיר/לפי המערכת), שפה (עברית/אנגלית — משפיע על כל
  האפליקציה מיידית), מפתח SteamGridDB לתמונות עטיפה, גיבוי/שחזור.

### דרישות
Windows 10/11 (64-bit). לא נדרשות הרשאות מנהל — אם אין הרשאות, ההתקנה
תיפול אוטומטית להתקנה אישית (`%LOCALAPPDATA%`) במקום `Program Files`.

### פתרון תקלות
- **לא רואה תמונות עטיפה?** היכנסו להגדרות והזינו מפתח SteamGridDB חינמי
  (הקישור נמצא שם).
- **משחק לא מופיע בספרייה?** נסו "הרצת אשף ההתקנה מחדש" מההגדרות עם סריקה
  מעמיקה מסומנת.
- **התוכנה כבר פתוחה ומתקין לא מגיב?** Playnest מזהה מופע פתוח ומונעת
  הפעלה כפולה — סגרו את החלון הקיים ונסו שוב.

---

## 📋 Features

### Core Library
- **Smart scanning** — Steam, Epic, and Windows registry, plus an optional deep
  folder scan across chosen drives.
- **Only real shortcuts.** Installer/uninstaller stubs (`setup.exe`,
  `unins000.exe`, redistributables) are filtered out, and any entry that
  doesn't point at a real, working file or folder is never shown.
- **Deduplication** by both name and install path — one entry per game, even
  when it's visible to more than one scan source.
- **Fast startup, background artwork.** Your library appears as soon as
  scanning finishes; cover art fills in afterward without blocking the UI.
- Fuzzy search, custom collections, favorites, hidden items.

### Tools — one sidebar section, all genuinely functional
- **🚀 Performance Mode** — toggles Windows' real `AutoGameModeEnabled`
  registry key *and* switches your actual power plan via `powercfg`, in one
  page (these used to be two confusingly-similar pages — merged in v3.1.2).
- **🔥 Streak Tracker** — counts real days you launched something through
  Playnest.
- **⚡ System Monitor** — live CPU/RAM/temperature from real hardware sensors.
- **📊 Analytics / 💡 Recommended / 🎮 Game Insights** — computed from your
  real library and playtime data.
- **💾 Storage / 🖥️ My Hardware** — real per-drive usage and real CPU/GPU/RAM
  specs with a performance tier score.

### Bilingual, dark/light, single-instance
- Full English/Hebrew UI (`locales/en.json`, `locales/he.json`) with live RTL
  switching — no restart needed. The installer itself offers the same choice
  on its first page.
- Dark/Light theme with automatic OS detection (`system` — the default) or a
  manual override, in Settings.
- The app refuses to open a second instance while one is already running
  (`app.requestSingleInstanceLock`) — focuses the existing window instead.

See [CHANGELOG.md](CHANGELOG.md) for full version history, and
[SPEC.md](SPEC.md) for the extended technical/product specification.

---

## ✅ Quick Start

```bash
npm install
npx tsc --noEmit     # TypeScript check
npm test              # Smoke tests (scanner logic, locale completeness, version sync)
npm run dist          # Build + package installer
```

**Output:** `Playnest-Setup-3.4.1.exe` in the project root (~76 MB).

### Install
- Run the installer from the project root
- Choose English or Hebrew on the first screen
- Follow the setup wizard to pick drives to scan (or skip it — Settings has
  "Run Setup Wizard Again" anytime)
- Your library appears immediately; artwork fills in shortly after

---

## 🏗️ Project Structure

```
Playnest/
├── Playnest-Setup-<version>.exe  # Final installer — always in root
├── CHANGELOG.md                   # Full version history
├── SPEC.md                        # Extended spec — what/how/why
├── README.md                      # This file (he + en)
├── version.json                   # Single source of truth for the version
├── index.html                     # Vite entry point (source, not build output)
├── package.json
│
├── src/                            # React app
│   ├── components/                 # UI (library grid, settings, Tools section)
│   ├── styles/global.css           # Theme (dark/light, RTL-aware)
│   ├── i18n.ts                     # Translation loader + useTranslation() hook
│   ├── types.ts                    # Shared TypeScript interfaces
│   └── App.tsx                     # Main app router
│
├── electron/                       # Electron main process
│   ├── main.cjs                     # IPC handlers (scan, art, system tools)
│   ├── scanner.cjs                  # Steam/Epic/registry/folder scanning + validation
│   ├── hardware.cjs                 # Real hardware profiling (systeminformation)
│   ├── preload.cjs                  # window.playnest bridge
│   └── store.cjs                    # Local persistence (electron-store)
│
├── locales/                        # UI strings — en.json, he.json (i18n keys)
├── assets/                         # Branding: icon.ico/.png, logo.svg, installer graphics
├── tests/                          # Smoke tests (node --test)
├── site/                           # Public landing page + investor presentation
├── docs/                           # Supplementary (business plan)
│
└── build/                          # Build-only: generator scripts, license text,
                                     # and electron-builder's own working output
                                     # (build/dist = compiled web assets,
                                     #  build/release = NSIS working directory)
```

---

## 🔧 Development

**Prerequisites:** Node.js 18+, npm 9+, Windows 10/11

```bash
npm install
npm run dev:vite       # Frontend dev server
npm run dev:electron   # Electron dev mode
npm run build            # Production build (web assets only, into build/dist)
npm run icons             # Regenerate app icon + installer graphics from assets/logo.svg
npm run version:sync       # Sync package.json version from version.json
npm test                    # Run smoke tests
npm run dist                 # Full installer build (version sync → build → package → finalize)
```

---

## 🎯 Tech Stack

- **Frontend:** React 18 + TypeScript
- **Desktop:** Electron 31
- **Build:** Vite 5 + electron-builder (NSIS, English/Hebrew installer)
- **Search:** Fuse.js
- **Storage:** electron-store
- **Hardware/system data:** `systeminformation`, Windows `reg`/`powercfg`
- **i18n:** custom (`src/i18n.ts`) — no external dependency

---

## 📄 License

Playnest Software © 2026 — Local. Private. No accounts. No telemetry.

The only network call Playnest makes is to SteamGridDB, to fetch cover art
(requires your own free API key — see Settings).
