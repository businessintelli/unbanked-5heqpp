import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Sun, Moon, Menu } from 'lucide-react'; // ^0.284.0
import { useMediaQuery } from '@react-hook/media-query'; // ^1.1.1
import FocusTrap from 'focus-trap-react'; // ^10.0.0

import { Navigation } from './Navigation';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  ariaLabel?: string;
  initialFocus?: boolean;
}

/**
 * Enhanced sidebar component with accessibility and responsive features
 */
export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  className,
  ariaLabel = 'Main navigation sidebar',
  initialFocus = true,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { isAuthenticated, userRole } = useAuth();
  const { theme, toggleTheme, systemTheme } = useTheme();

  /**
   * Enhanced theme toggle handler with system preference support
   */
  const handleThemeToggle = useCallback(() => {
    // Add transition class for smooth theme changes
    document.documentElement.classList.add('theme-transition');
    toggleTheme();
    
    // Remove transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
    }, 150);

    // Close sidebar on mobile after theme change
    if (isMobile) {
      onClose();
    }
  }, [toggleTheme, isMobile, onClose]);

  /**
   * Handle click outside sidebar for mobile views
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMobile &&
        isOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, isOpen, onClose]);

  /**
   * Handle keyboard navigation and accessibility
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Render mobile or desktop sidebar based on screen size
  const sidebarContent = (
    <div
      ref={sidebarRef}
      className={cn(
        'fixed inset-y-0 left-0 z-50',
        'flex flex-col bg-background border-r',
        'transition-transform duration-200 ease-in-out',
        'w-64 md:w-auto md:relative md:translate-x-0',
        isMobile && !isOpen && '-translate-x-full',
        className
      )}
      role="complementary"
      aria-label={ariaLabel}
    >
      {/* Navigation Component */}
      <Navigation
        className="flex-1"
        collapsed={!isOpen}
        onCollapse={isMobile ? onClose : undefined}
        ariaLabel="Main navigation menu"
      />

      {/* Theme Toggle */}
      <div className="p-4 border-t">
        <button
          onClick={handleThemeToggle}
          className={cn(
            'flex items-center justify-center w-full gap-2 px-4 py-2',
            'rounded-md transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary'
          )}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Moon className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="text-sm font-medium">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
      </div>
    </div>
  );

  // Wrap with FocusTrap for mobile view
  if (isMobile) {
    return (
      <FocusTrap
        active={isOpen}
        focusTrapOptions={{
          initialFocus: initialFocus,
          allowOutsideClick: true,
          clickOutsideDeactivates: true,
          returnFocusOnDeactivate: true,
        }}
      >
        {sidebarContent}
      </FocusTrap>
    );
  }

  return sidebarContent;
};

export default Sidebar;