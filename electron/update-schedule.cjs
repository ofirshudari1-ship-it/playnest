// When to check for updates and when to prompt. Pure helpers (no Electron) so the rules are
// unit-testable. Same design as TapAct's update-schedule.js: a periodic check (the app can stay
// open for days), a first check shortly after launch, and one restart prompt per downloaded version.

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const FIRST_CHECK_DELAY_MS = 5000; // shortly after launch

// A periodic check is skipped while one is already running or downloading, and once an update is
// downloaded and waiting (the user already has the restart prompt / tray item; it also installs on quit).
function shouldRunPeriodicCheck(state) {
  return !(state === 'checking' || state === 'downloading' || state === 'ready');
}

// The restart prompt is shown once per downloaded version, not at every periodic check.
function shouldPromptForVersion(notifiedVersion, version) {
  return !!version && notifiedVersion !== version;
}

// After the PC wakes from sleep, check right away if the last check is older than one interval
// (timers do not fire while asleep, so a laptop could otherwise skip a whole day).
function isCheckOverdue(lastCheckAtMs, nowMs, intervalMs = UPDATE_CHECK_INTERVAL_MS) {
  return !lastCheckAtMs || nowMs - lastCheckAtMs >= intervalMs;
}

module.exports = { UPDATE_CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, shouldRunPeriodicCheck, shouldPromptForVersion, isCheckOverdue };
