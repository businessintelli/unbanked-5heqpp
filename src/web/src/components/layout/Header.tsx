import React, { useState, useEffect, useCallback } from 'react'; // ^18.2.0
import { Link } from 'react-router-dom'; // ^6.16.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { Sun, Moon, Menu, User, LogOut, Settings } from 'lucide-react'; // ^0.284.0
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@shadcn/ui'; // ^0.1.0

import Navigation from './Navigation';
import { theme } from '../../config/theme';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, signOut } = useAuth();
  const { theme: currentTheme, setTheme } = useTheme();

  // Handle scroll events for header styling
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Toggle mobile menu with accessibility support
  const toggleMobileMenu = useCallback(() => {
    setIsOpen(prev => !prev);
    // Toggle body scroll lock
    document.body.style.overflow = !isOpen ? 'hidden' : 'unset';
    // Update ARIA attributes
    document.getElementById('mobile-menu')?.setAttribute('aria-expanded', (!isOpen).toString());
  }, [isOpen]);

  // Handle theme changes with system preference detection
  const handleThemeChange = useCallback((newTheme: 'light' | 'dark') => {
    document.documentElement.classList.add('theme-transition');
    setTheme(newTheme);
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transition');
    }, 300);
  }, [setTheme]);

  return (
    <header
      className={cn(
        'fixed top-0 w-full z-50 transition-all duration-200',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        isScrolled && 'border-b shadow-sm',
        className
      )}
      role="banner"
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo and Brand */}
        <Link
          to="/"
          className="flex items-center space-x-2"
          aria-label="Unbanked Home"
        >
          <img
            src="/logo.svg"
            alt=""
            className="h-8 w-8"
            aria-hidden="true"
          />
          <span className="font-semibold text-xl text-foreground">Unbanked</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-6">
          <Navigation className="flex items-center space-x-4" />
        </nav>

        {/* Theme Toggle and User Menu */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleThemeChange(currentTheme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {currentTheme === 'dark' ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                  aria-label="Open user menu"
                >
                  <User className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      KYC Level {user.kyc_level}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-red-600 focus:text-red-600"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button variant="ghost" asChild>
                <Link to="/auth/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/auth/register">Register</Link>
              </Button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleMobileMenu}
            aria-controls="mobile-menu"
            aria-expanded={isOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">
              {isOpen ? 'Close menu' : 'Open menu'}
            </span>
          </Button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div
        id="mobile-menu"
        className={cn(
          'fixed inset-0 z-50 bg-background md:hidden',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-hidden={!isOpen}
      >
        <Navigation
          className="p-6 pt-20"
          onClose={() => setIsOpen(false)}
        />
      </div>
    </header>
  );
};

export default Header;