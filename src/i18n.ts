import { useEffect, useState } from 'react';
import en from '../locales/en.json';
import he from '../locales/he.json';
import type { Language } from './types';

type Dict = typeof en;
const DICTS: Record<Language, Dict> = { en, he: he as Dict };

let currentLanguage: Language = 'en';
const listeners = new Set<() => void>();

export function setLanguage(lang: Language) {
  if (currentLanguage === lang) return;
  currentLanguage = lang;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'he' ? 'rtl' : 'ltr');
  listeners.forEach((fn) => fn());
}

export function getLanguage() {
  return currentLanguage;
}

function resolve(dict: Dict, path: string): string | undefined {
  return path.split('.').reduce<any>((node, key) => (node == null ? undefined : node[key]), dict);
}

// Flat "section.key" lookup with {placeholder} interpolation and an automatic
// fallback to English for any key a translation hasn't caught up with yet —
// so a missing Hebrew string never renders as a raw "settings.foo" key.
export function t(key: string, vars?: Record<string, string | number>): string {
  let str = resolve(DICTS[currentLanguage], key) ?? resolve(DICTS.en, key) ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
  }
  return str;
}

// Minimal pub/sub so components using `t()` outside React state re-render
// when the language changes — paired with the useLanguage() hook below.
export function subscribeLanguage(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Re-renders the calling component whenever the language changes, so `t()`
// calls in its JSX pick up the new strings immediately.
export function useTranslation() {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeLanguage(() => forceRender((n) => n + 1));
    return () => { unsubscribe(); };
  }, []);
  return t;
}
