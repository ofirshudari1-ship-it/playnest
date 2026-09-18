// Minimal parser for Valve's VDF (KeyValues) text format, used by
// Steam's libraryfolders.vdf and appmanifest_*.acf files.
function parseVdf(text) {
  let i = 0;
  const n = text.length;

  function skipWhitespaceAndComments() {
    for (;;) {
      while (i < n && /\s/.test(text[i])) i++;
      if (text[i] === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++;
        continue;
      }
      break;
    }
  }

  function readQuotedString() {
    // assumes text[i] === '"'
    i++;
    let out = '';
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) {
        out += text[i + 1];
        i += 2;
      } else {
        out += text[i];
        i++;
      }
    }
    i++; // closing quote
    return out;
  }

  function readObject() {
    const obj = {};
    for (;;) {
      skipWhitespaceAndComments();
      if (i >= n) break;
      if (text[i] === '}') {
        i++;
        break;
      }
      if (text[i] !== '"') {
        i++;
        continue;
      }
      const key = readQuotedString();
      skipWhitespaceAndComments();
      if (text[i] === '{') {
        i++;
        obj[key] = readObject();
      } else if (text[i] === '"') {
        obj[key] = readQuotedString();
      } else {
        obj[key] = '';
      }
    }
    return obj;
  }

  skipWhitespaceAndComments();
  if (text[i] === '"') {
    const rootKey = readQuotedString();
    skipWhitespaceAndComments();
    if (text[i] === '{') {
      i++;
      return { [rootKey]: readObject() };
    }
  }
  return {};
}

module.exports = { parseVdf };
