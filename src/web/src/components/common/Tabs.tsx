import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { colors, borderRadius } from '../../config/theme';

// Interface for individual tab items
interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

// Props interface for the Tabs component
interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'default' | 'underline' | 'pills';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  lazyLoad?: boolean;
}

// Utility function to generate variant-based styles
export const tabsVariants = cn.create({
  base: "flex flex-col w-full transition-all",
  variants: {
    variant: {
      default: "border-b border-gray-200 dark:border-gray-700",
      underline: "border-b-2 border-transparent",
      pills: "gap-1",
    },
    size: {
      sm: "text-sm",
      default: "text-base",
      lg: "text-lg",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

// Tab list styles based on variant
const getTabListStyles = (variant: TabsProps['variant']) => {
  const baseStyles = "flex relative";
  switch (variant) {
    case 'pills':
      return cn(baseStyles, "p-1 bg-gray-100 dark:bg-gray-800 rounded-lg");
    case 'underline':
      return cn(baseStyles, "border-b border-gray-200 dark:border-gray-700");
    default:
      return baseStyles;
  }
};

// Individual tab button styles
const getTabStyles = (
  variant: TabsProps['variant'],
  size: TabsProps['size'],
  isActive: boolean,
  disabled: boolean
) => {
  const baseStyles = cn(
    "flex items-center justify-center transition-all outline-none",
    disabled && "opacity-50 cursor-not-allowed",
    !disabled && "hover:text-primary-600 dark:hover:text-primary-400"
  );

  const sizeStyles = {
    sm: "px-3 py-1.5",
    default: "px-4 py-2",
    lg: "px-6 py-3",
  }[size || 'default'];

  const activeStyles = isActive ? {
    default: "border-b-2 border-primary-600 dark:border-primary-400",
    underline: "border-b-2 border-primary-600 dark:border-primary-400",
    pills: "bg-white dark:bg-gray-700 shadow-sm",
  }[variant || 'default'] : '';

  return cn(baseStyles, sizeStyles, activeStyles);
};

export const Tabs: React.FC<TabsProps> = ({
  items,
  defaultTab,
  onChange,
  variant = 'default',
  size = 'default',
  className,
  lazyLoad = false,
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || items[0]?.id);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [renderedTabs, setRenderedTabs] = useState<Set<string>>(
    new Set(lazyLoad ? [activeTab] : items.map(item => item.id))
  );

  // Handle tab change
  const handleTabChange = (tabId: string) => {
    if (tabId !== activeTab) {
      setActiveTab(tabId);
      if (lazyLoad && !renderedTabs.has(tabId)) {
        setRenderedTabs(prev => new Set([...prev, tabId]));
      }
      onChange?.(tabId);
    }
  };

  // Keyboard navigation handler
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledTabs = items.filter(item => !item.disabled);
    const currentIndex = enabledTabs.findIndex(item => item.id === activeTab);
    let newIndex: number;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = currentIndex + 1 >= enabledTabs.length ? 0 : currentIndex + 1;
        event.preventDefault();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = currentIndex - 1 < 0 ? enabledTabs.length - 1 : currentIndex - 1;
        event.preventDefault();
        break;
      case 'Home':
        newIndex = 0;
        event.preventDefault();
        break;
      case 'End':
        newIndex = enabledTabs.length - 1;
        event.preventDefault();
        break;
      default:
        return;
    }

    const newTab = enabledTabs[newIndex];
    handleTabChange(newTab.id);
    tabRefs.current.get(newTab.id)?.focus();
  };

  return (
    <div
      className={tabsVariants({ variant, size, className })}
      role="tablist"
      onKeyDown={handleKeyDown}
      aria-orientation="horizontal"
    >
      <div className={getTabListStyles(variant)}>
        {items.map((tab) => (
          <button
            key={tab.id}
            ref={el => el && tabRefs.current.set(tab.id, el)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={getTabStyles(variant, size, activeTab === tab.id, !!tab.disabled)}
            onClick={() => !tab.disabled && handleTabChange(tab.id)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="mr-2">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {items.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            tabIndex={0}
            className={cn(
              "focus:outline-none focus-visible:ring-2",
              "focus-visible:ring-primary-500 rounded-md",
              activeTab === tab.id ? "animate-fadeIn" : "animate-fadeOut"
            )}
          >
            {(!lazyLoad || renderedTabs.has(tab.id)) && tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Tabs;