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

!macro customInit
  !insertmacro customCheckAppRunning
!macroend

!macro customUnInit
  !insertmacro customCheckAppRunning
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

  ; Brand palette, WCAG-AA audited: raw --accent violet (#7c5cff) against
  ; white text is only 4.35:1 — under the 4.5:1 AA threshold for
  ; normal-size button text. Darkened ~10% to #7053e5 (5.18:1 vs white,
  ; passes AA) while staying clearly the same violet.
  Function ColorPrimaryButton
    GetDlgItem $0 $HWNDPARENT 1 ; Next / Install / Finish
    System::Call 'uxtheme::SetWindowTheme(i r0, w "", w "") i .r1'
    SetCtlColors $0 0xFFFFFF 0x7053E5
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
