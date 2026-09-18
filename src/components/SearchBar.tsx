import { useState, useRef, useEffect } from 'react';
import type { LibraryItem } from '../types';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  library: LibraryItem[];
  inputRef?: React.RefObject<HTMLInputElement>;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, library, inputRef, placeholder }: SearchBarProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('playnest_recent_searches');
    if (stored) setRecentSearches(JSON.parse(stored));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!suggestionsRef.current?.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    if (showSuggestions) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showSuggestions]);

  const suggestions = value.trim().length > 0 ? library
    .filter((item) =>
      item.name.toLowerCase().includes(value.toLowerCase()) ||
      item.publisher?.toLowerCase().includes(value.toLowerCase())
    )
    .slice(0, 5)
    .map((item) => ({ type: 'game' as const, value: item.name })) : [];

  const displayList = value.trim().length === 0 ? recentSearches : suggestions.map((s) => s.value);

  function handleSearch(term: string) {
    onChange(term);
    setShowSuggestions(false);
    if (term.trim()) {
      const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('playnest_recent_searches', JSON.stringify(updated));
    }
  }

  return (
    <div className="search-wrapper">
      <div className="search-box">
        <span>🔍</span>
        <input
          ref={inputRef}
          placeholder={placeholder || 'Search your games and apps...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
        />
        <span className="search-hint">⌘K</span>
      </div>

      {showSuggestions && displayList.length > 0 && (
        <div className="search-suggestions" ref={suggestionsRef}>
          <div className="suggestions-label">
            {value.trim() ? '🔎 Quick access' : '📋 Recent searches'}
          </div>
          {displayList.map((term, i) => (
            <div
              key={i}
              className="suggestion-item"
              onClick={() => handleSearch(term)}
            >
              <span>{term}</span>
              {value.trim() === '' && <span className="suggestion-clear">✕</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
