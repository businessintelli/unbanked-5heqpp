import { useState, useEffect, useCallback } from 'react'; // ^18.2.0
import { colors } from '../config/theme';
import { storage } from '../lib/storage';

// Theme type definition
type Theme = 'light' | 'dark';

// Storage key for theme persistence
const STORAGE_KEY = 'unbanked_theme';

// Custom event for theme changes
const THEME_CHANGE_EVENT = 'theme-change';

/**
 * Custom hook for managing application theme with system preference detection,
 * persistence, and CSS variable management
 */
export function useTheme() {
  // Initialize theme state from storage or system preference
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = storage.getItem<Theme>(STORAGE_KEY);
    return storedTheme || getSystemTheme();
  });

  // Track system theme preference
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme());

  /**
   * Applies theme changes to DOM with CSS variable updates
   */
  const applyTheme = useCallback((newTheme: Theme) => {
    // Update root class for theme context
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);

    // Update CSS variables for theme colors
    Object.entries(colors).forEach(([colorName, variants]) => {
      const value = variants[newTheme] || variants.DEFAULT;
      document.documentElement.style.setProperty(
        `--color-${colorName}`,
        value
      );
      document.documentElement.style.setProperty(
        `--color-${colorName}-${newTheme}`,
        variants[newTheme]
      );
    });

    // Update meta theme-color for mobile devices
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        newTheme === 'dark' ? colors.background.dark : colors.background.light
      );
    }

    // Dispatch theme change event
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, {
      detail: { theme: newTheme }
    }));
  }, []);

  /**
   * Updates theme with persistence and DOM updates
   */
  const setTheme = useCallback((newTheme: Theme) => {
    try {
      // Persist theme preference
      storage.setItem(STORAGE_KEY, newTheme, true);
      
      // Update state and apply changes
      setThemeState(newTheme);
      applyTheme(newTheme);
    } catch (error) {
      console.error('Failed to set theme:', error);
      // Fallback to system theme on error
      const fallbackTheme = getSystemTheme();
      setThemeState(fallbackTheme);
      applyTheme(fallbackTheme);
    }
  }, [applyTheme]);

  /**
   * Toggles between light and dark themes
   */
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  // Handle system theme preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSystemTheme);
      
      // Update theme if following system preference
      if (!storage.getItem(STORAGE_KEY)) {
        setTheme(newSystemTheme);
      }
    };

    // Add listener with modern API
    mediaQuery.addEventListener('change', handleChange);

    // Initial system theme application
    if (!storage.getItem(STORAGE_KEY)) {
      setTheme(getSystemTheme());
    }

    // Apply current theme on mount
    applyTheme(theme);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme, setTheme, applyTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    systemTheme
  };
}

/**
 * Detects system color scheme preference
 */
function getSystemTheme(): Theme {
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  } catch (error) {
    console.error('Failed to detect system theme:', error);
    return 'light'; // Fallback to light theme
  }
}

// Type definitions for hook return value
export type ThemeHookReturn = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  systemTheme: Theme;
};

export default useTheme;