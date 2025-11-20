import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const isBrowser = typeof window !== 'undefined';

const resolveStoredTheme = (): ThemeMode => {
  if (!isBrowser) return 'light';
  const stored = localStorage.getItem('theme') as ThemeMode | null;
  if (stored === 'dark' || stored === 'system' || stored === 'light') {
    return stored;
  }
  return 'light';
};

const resolveSystemPreference = (): 'light' | 'dark' => {
  if (!isBrowser) return 'light';
  try {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    // If matches is true, system prefers dark; if false, system prefers light
    return mediaQuery.matches ? 'dark' : 'light';
  } catch (error) {
    console.error('Error detecting system theme preference:', error);
    // Default to light if detection fails
    return 'light';
  }
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => resolveStoredTheme());

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    const initialTheme = resolveStoredTheme();
    return initialTheme === 'system' ? resolveSystemPreference() : initialTheme;
  });

  // Update effective theme when theme changes
  useEffect(() => {
    if (theme === 'system') {
      try {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = (event: MediaQueryListEvent | MediaQueryList) => {
          // Handle both event and direct mediaQuery object
          const isDark = 'matches' in event ? event.matches : (event as MediaQueryList).matches;
          setEffectiveTheme(isDark ? 'dark' : 'light');
        };

        // Set initial theme based on system preference
        const systemTheme = mediaQuery.matches ? 'dark' : 'light';
        setEffectiveTheme(systemTheme);

        // Listen for changes
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', updateTheme);
          return () => mediaQuery.removeEventListener('change', updateTheme);
        } else {
          // Fallback for older browsers
          mediaQuery.addListener(updateTheme);
          return () => mediaQuery.removeListener(updateTheme);
        }
      } catch (error) {
        console.error('Error setting up system theme listener:', error);
        // Default to light if there's an error
        setEffectiveTheme('light');
      }
    } else {
      setEffectiveTheme(theme);
    }
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    if (!isBrowser) return;
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
  }, [effectiveTheme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (isBrowser) {
      localStorage.setItem('theme', newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

