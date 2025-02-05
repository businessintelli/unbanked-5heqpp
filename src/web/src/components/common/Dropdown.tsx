import React, { useCallback, useState, useEffect, useRef } from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { ChevronDown } from 'lucide-react'; // ^0.294.0
import { theme, colors } from '../../config/theme';
import { useTheme } from '../../hooks/useTheme';

// Dropdown option interface
interface DropdownOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  description?: string;
}

// Props interface with comprehensive options
interface DropdownProps {
  options: DropdownOption[];
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  className?: string;
  renderOption?: (option: DropdownOption) => React.ReactNode;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

// Style variants using class-variance-authority
const dropdownVariants = cn(
  'relative w-full rounded-md border transition-colors focus-within:ring-2 focus-within:ring-primary-500',
  {
    variants: {
      theme: {
        light: 'border-gray-300 bg-white text-gray-900',
        dark: 'border-gray-600 bg-gray-800 text-gray-100'
      },
      error: {
        true: 'border-red-500 focus-within:ring-red-500',
        false: ''
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: 'cursor-pointer'
      },
      loading: {
        true: 'opacity-75',
        false: ''
      }
    }
  }
);

const menuVariants = cn(
  'absolute z-50 w-full mt-1 rounded-md shadow-lg transition-opacity',
  {
    variants: {
      theme: {
        light: 'bg-white border border-gray-300',
        dark: 'bg-gray-800 border border-gray-600'
      }
    }
  }
);

const optionVariants = cn(
  'px-3 py-2 text-sm transition-colors',
  {
    variants: {
      theme: {
        light: 'hover:bg-gray-100 focus:bg-gray-100',
        dark: 'hover:bg-gray-700 focus:bg-gray-700'
      },
      selected: {
        true: 'bg-primary-50 text-primary-900 dark:bg-primary-900 dark:text-primary-50',
        false: ''
      },
      disabled: {
        true: 'opacity-50 cursor-not-allowed',
        false: 'cursor-pointer'
      }
    }
  }
);

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  loading = false,
  error,
  className,
  renderOption,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy
}) => {
  // Theme context
  const { theme: currentTheme } = useTheme();

  // State management
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string | number | undefined>(
    value ?? defaultValue
  );
  const [activeDescendant, setActiveDescendant] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout>();

  // Refs
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // Get selected option
  const selectedOption = options.find(opt => opt.value === selectedValue);

  // Handle value changes from props
  useEffect(() => {
    if (value !== undefined && value !== selectedValue) {
      setSelectedValue(value);
    }
  }, [value]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle option selection
  const handleSelect = useCallback((option: DropdownOption) => {
    if (option.disabled) return;

    setSelectedValue(option.value);
    setIsOpen(false);
    onChange?.(option.value);
  }, [onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled || loading) return;

    switch (event.key) {
      case 'Enter':
      case 'Space':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else if (activeDescendant) {
          const option = options.find(opt => `${opt.value}` === activeDescendant);
          if (option) handleSelect(option);
        }
        break;

      case 'Escape':
        setIsOpen(false);
        break;

      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = activeDescendant
            ? options.findIndex(opt => `${opt.value}` === activeDescendant)
            : -1;
          const nextIndex = event.key === 'ArrowDown'
            ? (currentIndex + 1) % options.length
            : (currentIndex - 1 + options.length) % options.length;
          setActiveDescendant(`${options[nextIndex].value}`);
        }
        break;

      default:
        // Type-ahead search
        if (event.key.length === 1) {
          clearTimeout(searchTimeout);
          setSearchQuery(prev => prev + event.key);
          const timeout = setTimeout(() => setSearchQuery(''), 500);
          setSearchTimeout(timeout);

          const matchingOption = options.find(opt =>
            opt.label.toLowerCase().startsWith(searchQuery.toLowerCase())
          );
          if (matchingOption) {
            setActiveDescendant(`${matchingOption.value}`);
          }
        }
    }
  }, [disabled, loading, isOpen, activeDescendant, options, handleSelect, searchQuery, searchTimeout]);

  return (
    <div
      ref={dropdownRef}
      className={cn(
        dropdownVariants({
          theme: currentTheme,
          error: !!error,
          disabled,
          loading
        }),
        className
      )}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="w-full px-3 py-2 text-left flex items-center justify-between"
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        aria-invalid={!!error}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 transition-transform',
            isOpen && 'transform rotate-180'
          )}
        />
      </button>

      {error && (
        <div
          className="mt-1 text-sm text-red-500"
          role="alert"
          id={`${ariaDescribedBy}-error`}
        >
          {error}
        </div>
      )}

      {isOpen && (
        <ul
          ref={menuRef}
          className={menuVariants({ theme: currentTheme })}
          role="listbox"
          aria-activedescendant={activeDescendant}
          tabIndex={-1}
        >
          {options.map((option) => (
            <li
              key={option.value}
              id={`${option.value}`}
              role="option"
              aria-selected={option.value === selectedValue}
              aria-disabled={option.disabled}
              className={optionVariants({
                theme: currentTheme,
                selected: option.value === selectedValue,
                disabled: option.disabled
              })}
              onClick={() => handleSelect(option)}
            >
              {renderOption ? renderOption(option) : (
                <div className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {option.description}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Dropdown;