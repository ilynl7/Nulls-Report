import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Appearance system: Light / Dark / System.
 *
 * The chosen theme is persisted locally (survives reloads) and, when the user
 * is signed in, mirrored into the account preferences so it follows them to
 * other devices. Dark mode is implemented with the `.dark` class on <html>,
 * which flips the CSS variables in index.css — shadcn components and the
 * portal palette both react to it.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const STORAGE_KEY = 'nulls.theme';

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function readStored(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // localStorage unavailable
  }
  return 'system';
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
  // Native controls (scrollbars, date inputs…) follow the theme.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  // probe
  children,
  serverTheme,
}: {
  children: ReactNode;
  /** Preferred theme from the signed-in user's saved preferences, if any. */
  serverTheme?: string;
}) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = readStored();
    if (stored !== 'system') return stored;
    return serverTheme === 'light' || serverTheme === 'dark' ? serverTheme : stored;
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // no-op
    }
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
