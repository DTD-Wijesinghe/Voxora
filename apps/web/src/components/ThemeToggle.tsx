import { useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem('voxora-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Keep the branded dark theme when browser storage is unavailable.
  }
  return 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem('voxora-theme', theme); } catch { /* no-op */ }
  }, [theme]);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return <button className="theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={`Switch to ${nextTheme} mode`} aria-pressed={theme === 'light'}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span></button>;
}
