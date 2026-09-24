// Shared SteamGridDB key (2026-09-24 product decision): ships with every
// install so cover art works out of the box with no setup step. This key
// is distributed inside the app and is extractable by anyone who inspects
// it - a user can still set their own personal key in Settings, which
// always takes priority (see main.cjs) and gives them their own quota
// instead of sharing this one.
const DEFAULT_STEAMGRID_API_KEY = '767e70cd97f40a61befdb80d37314759';

module.exports = { DEFAULT_STEAMGRID_API_KEY };
