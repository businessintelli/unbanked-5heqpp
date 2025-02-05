import { createContext, useContext, ReactNode, useEffect } from 'react'; // ^18.2.0
import useTheme from '../hooks/useTheme';
import { colors, transitions } from '../config/theme';

/**
 * Theme context value interface with accessibility features
 */
interface ThemeContextValue {
  theme: string;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  systemPreference: string | null;
  highContrast: boolean;
  toggleHighContrast: () => void;
  isTransitioning: boolean;
  reducedMotion: boolean;
}

/**
 * Props interface for ThemeProvider component
 */
interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Create theme context with accessibility support
 */
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Enhanced theme provider component with accessibility features
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // Initialize theme management with enhanced hook
  const { theme, setTheme, toggleTheme, systemTheme } = useTheme();

  // Track theme transition state for animations
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Track reduced motion preference
  const [reducedMotion, setReducedMotion] = useState(false);

  // Track high contrast mode
  const [highContrast, setHighContrast] = useState(false);

  /**
   * Handle reduced motion preference changes
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      // Disable transitions when reduced motion is preferred
      document.documentElement.style.setProperty(
        '--transition-duration',
        e.matches ? '0ms' : transitions.default
      );
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  /**
   * Handle high contrast mode toggle
   */
  const toggleHighContrast = useCallback(() => {
    setHighContrast((prev) => {
      const newValue = !prev;
      // Apply high contrast color overrides
      Object.entries(colors).forEach(([colorName, variants]) => {
        document.documentElement.style.setProperty(
          `--color-${colorName}`,
          newValue ? variants.highContrast || variants.DEFAULT : variants[theme]
        );
      });
      return newValue;
    });
  }, [theme]);

  /**
   * Handle theme transitions
   */
  useEffect(() => {
    if (!reducedMotion) {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 200);
      return () => clearTimeout(timer);
    }
  }, [theme, reducedMotion]);

  /**
   * Enhanced theme context value with accessibility features
   */
  const contextValue: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    systemPreference: systemTheme,
    highContrast,
    toggleHighContrast,
    isTransitioning,
    reducedMotion
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Enhanced custom hook to access theme context with accessibility features
 */
export function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeProvider;