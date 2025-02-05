import React, { useState, useCallback, useEffect } from 'react'; // ^18.2.0
import { Outlet, useNavigate } from 'react-router-dom'; // ^6.20.0
import { useMediaQuery } from '@react-hook/media-query'; // ^1.1.1
import { cn } from 'class-variance-authority'; // ^0.7.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.11

import Header from './Header';
import Footer from './Footer';
import Sidebar from './Sidebar';
import { useAuth } from '../../hooks/useAuth';

interface AppShellProps {
  className?: string;
}

/**
 * Core layout component that provides the main application shell structure
 * Implements responsive design, theme support, and handles authentication state
 */
export const AppShell: React.FC<AppShellProps> = ({ className }) => {
  // State and hooks
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  /**
   * Handle sidebar toggle with proper focus management
   */
  const handleSidebarToggle = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  /**
   * Handle sidebar close with focus restoration
   */
  const handleSidebarClose = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  // Close sidebar on mobile when route changes
  useEffect(() => {
    if (isMobile) {
      handleSidebarClose();
    }
  }, [isMobile, handleSidebarClose]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/auth/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Error fallback component
  const ErrorFallback = ({ error, resetErrorBoundary }: any) => (
    <div 
      role="alert" 
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground"
    >
      <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
      <pre className="text-sm bg-muted p-4 rounded-md mb-4">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        className={cn(
          'min-h-screen bg-background text-foreground',
          'flex flex-col',
          className
        )}
      >
        {/* Header */}
        <Header 
          className="fixed top-0 w-full z-50"
          onMenuClick={handleSidebarToggle}
        />

        {/* Main Content */}
        <div className="flex flex-1 pt-16">
          {/* Sidebar */}
          {isAuthenticated && (
            <Sidebar
              isOpen={isSidebarOpen}
              onClose={handleSidebarClose}
              className={cn(
                'hidden md:block',
                !isSidebarOpen && 'w-[70px]'
              )}
            />
          )}

          {/* Main Content Area */}
          <main
            className={cn(
              'flex-1 px-4 py-8 md:px-8',
              'transition-all duration-200 ease-in-out',
              isAuthenticated && 'md:ml-[250px]',
              isAuthenticated && !isSidebarOpen && 'md:ml-[70px]'
            )}
            role="main"
            id="main-content"
          >
            {/* Dynamic Route Content */}
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

        {/* Footer */}
        <Footer className="mt-auto" />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          aria-hidden="true"
          onClick={handleSidebarClose}
        />
      )}
    </ErrorBoundary>
  );
};

// Default export
export default AppShell;