import React from 'react'; // ^18.2.0
import { Moon, Sun } from 'lucide-react'; // ^0.284.0
import { APP_NAME, APP_VERSION } from '../../config/constants';
import { useTheme } from '../../hooks/useTheme';

/**
 * Footer component providing copyright information, theme toggle, and essential links
 * Implements WCAG 2.1 Level AA compliance with proper contrast and accessibility features
 */
const Footer: React.FC = React.memo(() => {
  const { theme, toggleTheme } = useTheme();
  const currentYear = new Date().getFullYear();

  return (
    <footer 
      className="flex flex-col md:flex-row justify-between items-center w-full px-4 py-6 border-t border-gray-200 dark:border-gray-800"
      role="contentinfo"
      aria-label="Footer"
    >
      {/* Copyright Information */}
      <div className="text-sm text-gray-500 dark:text-gray-400 select-none">
        <span aria-label={`Copyright ${currentYear} ${APP_NAME}`}>
          &copy; {currentYear} {APP_NAME}
        </span>
        <span className="mx-2 text-gray-300 dark:text-gray-600">|</span>
        <span className="text-xs" aria-label={`Version ${APP_VERSION}`}>
          v{APP_VERSION}
        </span>
      </div>

      {/* Essential Links */}
      <nav 
        className="flex space-x-4 mt-4 md:mt-0 items-center"
        aria-label="Footer Navigation"
      >
        <a
          href="/privacy"
          className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          aria-label="Privacy Policy"
        >
          Privacy
        </a>
        <a
          href="/terms"
          className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          aria-label="Terms of Service"
        >
          Terms
        </a>
        <a
          href="/support"
          className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          aria-label="Support Center"
        >
          Support
        </a>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[44px] min-h-[44px]"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-gray-500 hover:text-gray-900" aria-hidden="true" />
          ) : (
            <Sun className="w-5 h-5 text-gray-400 hover:text-gray-100" aria-hidden="true" />
          )}
        </button>
      </nav>
    </footer>
  );
});

// Display name for debugging purposes
Footer.displayName = 'Footer';

export default Footer;