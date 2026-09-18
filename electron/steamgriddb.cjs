const fs = require('fs');
const path = require('path');

const API_BASE = 'https://www.steamgriddb.com/api/v2';

function coversDir(userDataPath) {
  const dir = path.join(userDataPath, 'covers');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function apiGet(apiKey, endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

function yearFromUnix(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).getUTCFullYear();
}

// Returns { id, releaseYear } — we already have to look the game up to get its cover,
// and the same response carries release_date, so grouping/filtering by release year
// costs no extra API calls.
async function resolveSgdbGame(apiKey, item) {
  if (item.steamAppId) {
    const data = await apiGet(apiKey, `/games/steam/${item.steamAppId}`);
    if (data && data.id) return { id: data.id, releaseYear: yearFromUnix(data.release_date) };
  }
  const searchData = await apiGet(apiKey, `/search/autocomplete/${encodeURIComponent(item.name)}`);
  if (Array.isArray(searchData) && searchData.length > 0) {
    return { id: searchData[0].id, releaseYear: yearFromUnix(searchData[0].release_date) };
  }
  return null;
}

// Returns { coverPath, releaseYear } on success (releaseYear may be null/undefined if
// unknown or if the cover was already cached from a previous run), or null if nothing
// was found at all.
async function fetchCoverForItem(apiKey, item, userDataPath) {
  const dir = coversDir(userDataPath);
  const cachedPath = path.join(dir, `${item.id}.jpg`);
  if (fs.existsSync(cachedPath)) {
    return { coverPath: cachedPath };
  }
  if (!apiKey) return null;

  try {
    const game = await resolveSgdbGame(apiKey, item);
    if (!game) return null;
    const grids = await apiGet(apiKey, `/grids/game/${game.id}?dimensions=600x900`);
    if (!Array.isArray(grids) || grids.length === 0) return { coverPath: null, releaseYear: game.releaseYear };
    const imageUrl = grids[0].url;
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return { coverPath: null, releaseYear: game.releaseYear };
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    fs.writeFileSync(cachedPath, buffer);
    return { coverPath: cachedPath, releaseYear: game.releaseYear };
  } catch {
    return null;
  }
}

function fileToDataUrl(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = { fetchCoverForItem, fileToDataUrl };
