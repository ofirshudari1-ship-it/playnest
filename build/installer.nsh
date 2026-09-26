; Custom NSIS hooks for electron-builder (see STANDARDS.md §7 — "AppMutex +
; running-process check" requirement, previously missing from Playnest same
; as almost every other tool in this project except SnapAI).
;
; electron-builder's own single-instance lock lives inside the *app*, not the
; installer — it does nothing to stop the installer from overwriting files
; while the app is still running and holding them open. This checks via
; `tasklist` before install AND before uninstall, and blocks with a
; Retry/Cancel prompt until the user actually closes it (or cancels).
;
; ${APP_EXECUTABLE_FILENAME} is provided by electron-builder's own generated
; script — no need to hardcode "Playnest.exe" here.

!macro customCheckAppRunning
  retry_check:
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /NH'
  Pop $0
  Pop $1
  StrLen $2 "${APP_EXECUTABLE_FILENAME}"
  StrCpy $3 $1 $2
  StrCmp $3 "${APP_EXECUTABLE_FILENAME}" 0 +3
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Playnest is currently running.$\r$\nPlease close it before continuing." IDRETRY retry_check
    Abort
!macroend

; ============================================================
; First-run language handoff (installer -> app)
;
; electron-builder's NSIS `displayLanguageSelector` only changes the
; INSTALLER's own UI language — there is no supported mechanism (no
; registry key, no env var, no file) for that choice to reach the app once
; installed, so electron/store.cjs's detectInstallLanguage() previously had
; to fall back to Electron's app.getLocale() (the OS display language) —
; the best available substitute, but wrong whenever someone's Windows
; locale differs from the language they explicitly picked on this
; installer's language-select dialog two screens earlier.
;
; $LANGUAGE (1033=English, 1037=Hebrew) is already known here: customInit
; runs from installer.nsi's Function .onInit right after
; MUI_LANGDLL_DISPLAY has shown the picker and set it (see
; node_modules/app-builder-lib/templates/nsis/installer.nsi), and before
; any files are extracted. Writing electron-store's actual nested JSON
; (settings.language inside a top-level "settings" object — see
; DEFAULT_SETTINGS/getSettings in electron/store.cjs) from NSIS string ops
; is impractical and risks producing an invalid or clobbering config file,
; so this drops a tiny plain-text marker instead: electron/store.cjs reads
; it once on first launch, seeds settings.language from it, and deletes it
; immediately after — the same "write once, never clobber an existing
; user's saved choice" contract store.cjs already applies to the
; app.getLocale() fallback, which remains in place as the last resort for
; the rare case the marker is somehow missing (e.g. a portable copy).
;
; Marker path matches electron-store's real on-disk location for this app:
; userData is $APPDATA\playnest (package.json "name": "playnest" — the same
; $APPDATA\playnest directory customUnInstall above already targets), and
; the store's own file there is playnest-library.json (electron-store's
; `name: 'playnest-library'` option). Only written when that store file
; does not exist yet, i.e. a genuinely fresh install/profile — an
; update/reinstall over an existing profile leaves the user's own saved
; language setting untouched.
; ============================================================

!macro WriteFirstRunLanguageMarker
  ${ifNot} ${FileExists} "$APPDATA\playnest\playnest-library.json"
    StrCpy $9 "en"
    ${if} $LANGUAGE == 1037
      StrCpy $9 "he"
    ${endif}
    CreateDirectory "$APPDATA\playnest"
    FileOpen $8 "$APPDATA\playnest\first-run-language.txt" w
    FileWrite $8 "$9"
    FileClose $8
  ${endif}
!macroend

!macro customInit
  !insertmacro customCheckAppRunning
  !insertmacro WriteFirstRunLanguageMarker
!macroend

; ============================================================
; "Delete my data?" uninstall prompt (STANDARDS.md §11.5/§16.2)
;
; electron-builder builds NSIS installers in two makensis passes sharing
; this same included file (see NsisTarget.js computeScriptAndSignUninstaller
; / installer.nsi): one with BUILD_UNINSTALLER defined, which is the only
; pass that !includes uninstaller.nsh (Function un.onInit / Section
; "un.install", where customUnInit/customUnInstall actually get inserted —
; this produces a throwaway signed copy of the uninstaller), and the main
; pass without it, which never sees uninstaller.nsh at all. A Var declared
; unconditionally here would sit unused in that second pass (nothing in it
; ever references an un-only variable) and NSIS's "-WX" (warnings as
; errors) turns that harmless "wasting memory" hint into a hard build
; failure — so isDeleteUserData below is scoped to the BUILD_UNINSTALLER
; pass only, matching where it's actually read/written.
;
; electron-builder's own template *can* wipe app data unconditionally (its
; deleteAppDataOnUninstall option / --delete-app-data flag, via its own
; $isDeleteAppData var — see the un.install Section in
; node_modules/app-builder-lib/templates/nsis/uninstaller.nsh), but that
; path never asks first, which is the wrong default for a tool that keeps
; real user data (library scan cache, settings, cover-art cache, play-streak
; history) only on this PC. We don't enable that option, and can't safely
; set electron-builder's own $isDeleteAppData from here either — it's
; declared *after* Function un.onInit in uninstaller.nsh, and NSIS requires
; a Var's declaration to be parsed before first use. So this asks the
; **one** legitimate uninstall question ("delete data too?", default = No
; via MB_DEFBUTTON2 making "No" the focused/Enter-activated button) and
; then removes the same three per-user $APPDATA locations electron-builder's
; own deleter would have used (APP_FILENAME / APP_PRODUCT_FILENAME /
; APP_PACKAGE_NAME — Electron's userData dir for this app is
; $APPDATA\playnest, matching APP_PACKAGE_NAME since package.json's "name"
; is "playnest").
; ============================================================

LangString UninstallDeleteDataQuestion 1033 "Also delete your Playnest library data (scan cache, settings, cover art, streak history)?$\r$\n$\r$\nChoose No to keep it in case you reinstall Playnest later."
LangString UninstallDeleteDataQuestion 1037 "להסיר גם את נתוני הספרייה של Playnest (מטמון הסריקה, ההגדרות, עטיפות המשחקים והיסטוריית הרצף)?$\r$\n$\r$\nבחרו לא כדי לשמור אותם, למקרה שתתקינו את Playnest מחדש בעתיד."

!ifdef BUILD_UNINSTALLER
  Var isDeleteUserData
!endif

!macro customUnInit
  !insertmacro customCheckAppRunning

  StrCpy $isDeleteUserData "0"
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$(UninstallDeleteDataQuestion)" IDYES un_delete_data_yes
  Goto un_delete_data_done
  un_delete_data_yes:
    StrCpy $isDeleteUserData "1"
  un_delete_data_done:
!macroend

!macro customUnInstall
  ${if} $isDeleteUserData == "1"
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
  ${endif}
!macroend

; ============================================================
; Welcome / Finish page copy + brand-color button styling
;
; Added on top of the running-instance check above — nothing above this
; line was touched. Two things NSIS's Modern UI 2 genuinely does NOT ship
; a welcome/finish page for an assisted (non-oneClick) installer unless a
; customWelcomePage/customFinishPage macro explicitly inserts one — before
; this change Playnest's installer had no welcome page and no finish-page
; text customization at all (it went straight from language pick to
; install-mode/directory). Real product copy is added below via
; MUI_WELCOMEPAGE_TEXT (the one welcome-page mechanism MUI2 actually
; supports — MUI_BGCOLOR/MUI_TEXTCOLOR do NOT exist in Modern UI 2, only
; in the older classic "Modern UI" — so they're not used here).
;
; Button "brand coloring": MUI2 gives no supported hook to change a
; standard Next/Back/Cancel button's shape or theme-drawn chrome. The one
; thing that IS real and works is: disable Windows' visual-style theming
; on a specific button handle (uxtheme::SetWindowTheme, via the System
; plugin bundled with NSIS) and then apply SetCtlColors — a native NSIS
; instruction that only takes effect once the OS theme stops repainting
; the button. Consequence, stated plainly: the "Next"/primary button
; drops the native rounded Windows 11 look and renders as a flat
; classic-style button in the brand color — a real, visible change, but
; not a shaped/rounded custom button PNG. Cancel is left themed/native on
; purpose (destructive/exit actions should stay visually standard).
; ============================================================

!ifndef BUILD_UNINSTALLER

  ; Numeric language IDs (1033=English, 1037=Hebrew) — ${LANG_*} constants
  ; are not available at include-time when displayLanguageSelector is true
  ; (same constraint documented in ActionClip's installer.nsh).
  LangString WelcomeTitle 1033 "Welcome to the Playnest ${VERSION} Setup Wizard"
  LangString WelcomeTitle 1037 "ברוכים הבאים לאשף ההתקנה של Playnest ${VERSION}"

  LangString WelcomeText 1033 "Playnest brings your entire game and software library into one place — installed games, launchers and apps scanned automatically from your drives and the Windows registry, organized into a single browsable grid with covers, playtime and quick launch.$\r$\n$\r$\nNo cloud account, no background telemetry: scanning and library data stay on this PC. Once installed you get automatic background rescans so newly installed games show up on their own, a global quick-launch hotkey (Ctrl+Shift+L), and adjustable grid density.$\r$\n$\r$\nClick Next to continue."
  LangString WelcomeText 1037 "Playnest מרכז את כל ספריית המשחקים והתוכנות שלך במקום אחד — משחקים, לאנצ'רים ואפליקציות מסורקים אוטומטית מהכוננים ומרישום Windows, ומוצגים ברשת אחת עם עטיפות, זמן משחק והפעלה מהירה.$\r$\n$\r$\nבלי חשבון ענן, בלי טלמטריה ברקע — הסריקה והנתונים נשארים על המחשב הזה. לאחר ההתקנה תקבלו סריקה חוזרת אוטומטית ברקע, קיצור מקלדת גלובלי להפעלה מהירה (Ctrl+Shift+L), ובקרת צפיפות תצוגה.$\r$\n$\r$\nלחץ הבא כדי להמשיך."

  LangString FinishTitle 1033 "Setup completed successfully!"
  LangString FinishTitle 1037 "ההתקנה הושלמה בהצלחה!"

  LangString FinishText 1033 "Playnest has been installed.$\r$\n$\r$\nOpen it any time from the desktop shortcut, the Start menu, or press Ctrl+Shift+L to bring it to the front from anywhere.$\r$\n$\r$\nClick Finish to close this wizard."
  LangString FinishText 1037 "Playnest הותקן בהצלחה.$\r$\n$\r$\nניתן לפתוח אותו מקיצור שולחן העבודה, מתפריט התחל, או ללחוץ Ctrl+Shift+L כדי להביא אותו לחזית מכל מקום.$\r$\n$\r$\nלחץ סיום כדי לסגור את האשף."

  ; Shared cross-product installer brand color (STANDARDS.md §21 — "IObit-
  ; style" unified installer+splash across OptiGuard/Playnest/ActionClip/
  ; SnapCap): the old Playnest-only violet (#7053E5) is replaced by the
  ; shared accent blue #2F6FED so all four installers use the same primary
  ; button color. WCAG-AA audited per §21.1: white text on #2F6FED = 4.9:1,
  ; passes AA for normal-size button text.
  Function ColorPrimaryButton
    GetDlgItem $0 $HWNDPARENT 1 ; Next / Install / Finish
    System::Call 'uxtheme::SetWindowTheme(i r0, w "", w "") i .r1'
    SetCtlColors $0 0xFFFFFF 0x2F6FED
  FunctionEnd

  !macro customWelcomePage
    !define MUI_WELCOMEPAGE_TITLE "$(WelcomeTitle)"
    !define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW ColorPrimaryButton
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  !macro customFinishPage
    !define MUI_FINISHPAGE_TITLE "$(FinishTitle)"
    !define MUI_FINISHPAGE_TEXT "$(FinishText)"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW ColorPrimaryButton
    !insertmacro MUI_PAGE_FINISH
  !macroend

!endif
