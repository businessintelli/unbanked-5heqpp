import { Link, useLocation, useNavigate } from 'react-router-dom'; // ^6.16.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { 
  Home, Wallet, Bitcoin, User, Settings, Sun, Moon, 
  Menu, ChevronLeft, AlertCircle 
} from 'lucide-react'; // ^0.284.0
import { 
  Button,
  Tooltip,
  Separator,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetTrigger
} from '@shadcn/ui'; // ^0.1.0

import { 
  dashboardRoutes, 
  bankingRoutes, 
  cryptoRoutes, 
  profileRoutes 
} from '../../config/routes';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { UserRole } from '../../types/auth';

interface NavigationProps {
  className?: string;
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  ariaLabel?: string;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  minRole: UserRole;
  requiresKYC?: boolean;
}

const navItems: NavItem[] = [
  { icon: Home, label: 'Dashboard', path: '/dashboard', minRole: UserRole.USER },
  { icon: Wallet, label: 'Banking', path: '/banking/wallets', minRole: UserRole.USER, requiresKYC: true },
  { icon: Bitcoin, label: 'Crypto', path: '/crypto/wallets', minRole: UserRole.USER, requiresKYC: true },
  { icon: User, label: 'Profile', path: '/profile', minRole: UserRole.USER },
  { icon: Settings, label: 'Settings', path: '/settings', minRole: UserRole.USER }
];

export const Navigation: React.FC<NavigationProps> = ({
  className,
  collapsed = false,
  onCollapse,
  ariaLabel = 'Main navigation'
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, userRole } = useAuth();
  const { theme, toggleTheme, systemTheme } = useTheme();

  const isRouteAccessible = (item: NavItem): boolean => {
    if (!isAuthenticated) return false;
    if (item.minRole && !user) return false;
    
    const userKYCLevel = user?.kyc_level || 0;
    if (item.requiresKYC && userKYCLevel < 2) return false;
    
    const roleHierarchy = {
      [UserRole.USER]: 1,
      [UserRole.SUPPORT]: 2,
      [UserRole.ADMIN]: 3
    };

    return roleHierarchy[userRole] >= roleHierarchy[item.minRole];
  };

  const isActiveRoute = (path: string): boolean => {
    return location.pathname.startsWith(path);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isActiveRoute(item.path);
    const accessible = isRouteAccessible(item);

    return (
      <Tooltip
        key={item.path}
        content={collapsed ? item.label : undefined}
        side="right"
        delayDuration={0}
      >
        <Button
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "w-full justify-start gap-4",
            collapsed && "justify-center p-2",
            !accessible && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => accessible && navigate(item.path)}
          disabled={!accessible}
          aria-current={isActive ? "page" : undefined}
        >
          <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
          {!collapsed && <span>{item.label}</span>}
          {!collapsed && !accessible && (
            <AlertCircle className="h-4 w-4 text-warning ml-auto" />
          )}
        </Button>
      </Tooltip>
    );
  };

  const renderMobileNav = () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <ScrollArea className="h-full py-4">
          <div className="space-y-2 px-2">
            {navItems.map(renderNavItem)}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );

  const renderDesktopNav = () => (
    <div
      className={cn(
        "hidden md:flex flex-col gap-2 p-2",
        collapsed ? "items-center" : "items-stretch",
        className
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onCollapse?.(!collapsed)}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        className="self-end mb-2"
      >
        <ChevronLeft className={cn("h-4 w-4", collapsed && "rotate-180")} />
      </Button>

      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {navItems.map(renderNavItem)}
        </div>
      </ScrollArea>

      <Separator className="my-2" />

      <Tooltip content={collapsed ? "Toggle theme" : undefined} side="right">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={toggleTheme}
          className="justify-start gap-4"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Moon className="h-5 w-5" />
          ) : (
            <Sun className="h-5 w-5" />
          )}
          {!collapsed && <span>Theme</span>}
        </Button>
      </Tooltip>
    </div>
  );

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "border-r bg-background",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {renderMobileNav()}
      {renderDesktopNav()}
    </nav>
  );
};

export default Navigation;