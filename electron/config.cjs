// No built-in SteamGridDB key is shipped — a shared key hardcoded here would be
// distributed to every user inside the installer, which defeats the point of a
// per-account API key. Each user supplies their own free key in Settings.
const DEFAULT_STEAMGRID_API_KEY = '';

module.exports = { DEFAULT_STEAMGRID_API_KEY };
