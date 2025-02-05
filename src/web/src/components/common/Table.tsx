import React, { useState, useCallback, useRef, useEffect } from 'react'; // ^18.2.0
import { cn } from 'class-variance-authority'; // ^0.7.0
import { ChevronUp, ChevronDown } from 'lucide-react'; // ^0.294.0
import Loading from './Loading';
import Button from './Button';

// Column interface with comprehensive configuration options
export interface Column<T = any> {
  id: string;
  header: string;
  accessor: keyof T | string;
  sortable?: boolean;
  minWidth?: string;
  maxWidth?: string;
  priority?: number;
  render?: (value: any, row: T) => React.ReactNode;
  ariaLabel?: string;
}

// Enhanced table props with accessibility and responsive features
export interface TableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
  stickyHeader?: boolean;
  virtualization?: {
    enabled: boolean;
    rowHeight: number;
  };
  accessibility?: {
    announceChanges: boolean;
    labelId: string;
  };
  onPageChange?: (page: number) => void;
  onSort?: (columns: { id: string; direction: 'asc' | 'desc' }[]) => void;
}

// Table variant generator with theme support
export const tableVariants = ({
  stickyHeader,
  isLoading,
  className,
}: Partial<TableProps> & { className?: string }) =>
  cn(
    // Base styles
    'w-full border-collapse overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700',
    // Responsive container
    'overflow-x-auto',
    // Loading state
    { 'opacity-75': isLoading },
    // Sticky header
    {
      '[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:bg-white dark:[&_thead_th]:bg-gray-800':
        stickyHeader,
    },
    className
  );

export const Table = <T extends Record<string, any>>({
  columns,
  data,
  isLoading = false,
  pagination,
  stickyHeader = false,
  virtualization,
  accessibility = {
    announceChanges: true,
    labelId: 'data-table',
  },
  onPageChange,
  onSort,
}: TableProps<T>) => {
  // Sort state management
  const [sortState, setSortState] = useState<{ id: string; direction: 'asc' | 'desc' }[]>([]);
  
  // Virtualization refs
  const tableRef = useRef<HTMLDivElement>(null);
  const [visibleRows, setVisibleRows] = useState<T[]>([]);

  // Accessibility announcement ref
  const announcer = useRef<HTMLDivElement>(null);

  // Handle sort click with multi-column support
  const handleSort = useCallback(
    (columnId: string) => {
      const column = columns.find((col) => col.id === columnId);
      if (!column?.sortable) return;

      const newSortState = [...sortState];
      const existingSort = newSortState.find((sort) => sort.id === columnId);

      if (existingSort) {
        if (existingSort.direction === 'asc') {
          existingSort.direction = 'desc';
        } else {
          newSortState.splice(newSortState.indexOf(existingSort), 1);
        }
      } else {
        newSortState.push({ id: columnId, direction: 'asc' });
      }

      setSortState(newSortState);
      onSort?.(newSortState);

      // Announce sort change to screen readers
      if (accessibility.announceChanges && announcer.current) {
        const direction = newSortState.find((sort) => sort.id === columnId)?.direction;
        const announcement = `Table sorted by ${column.header} ${direction === 'asc' ? 'ascending' : 'descending'}`;
        announcer.current.textContent = announcement;
      }
    },
    [columns, sortState, onSort, accessibility.announceChanges]
  );

  // Handle virtualization
  useEffect(() => {
    if (!virtualization?.enabled) {
      setVisibleRows(data);
      return;
    }

    const updateVisibleRows = () => {
      const container = tableRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const viewportHeight = container.clientHeight;
      const rowHeight = virtualization.rowHeight;

      const startIndex = Math.floor(scrollTop / rowHeight);
      const endIndex = Math.min(
        Math.ceil((scrollTop + viewportHeight) / rowHeight),
        data.length
      );

      setVisibleRows(data.slice(startIndex, endIndex + 1));
    };

    const container = tableRef.current;
    if (container) {
      container.addEventListener('scroll', updateVisibleRows);
      updateVisibleRows();
    }

    return () => {
      container?.removeEventListener('scroll', updateVisibleRows);
    };
  }, [data, virtualization]);

  // Render pagination controls
  const renderPagination = useCallback(() => {
    if (!pagination) return null;

    const { page, limit, total } = pagination;
    const totalPages = Math.ceil(total / limit);

    return (
      <div className="mt-4 flex items-center justify-between px-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} results
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page === 1}
            aria-label="Previous page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      </div>
    );
  }, [pagination, onPageChange]);

  return (
    <div
      ref={tableRef}
      className={tableVariants({ stickyHeader, isLoading })}
      role="region"
      aria-labelledby={accessibility.labelId}
    >
      {/* Screen reader announcements */}
      <div
        ref={announcer}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50">
          <Loading size="lg" />
        </div>
      )}

      <table className="w-full">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn(
                  'px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100',
                  'border-b border-gray-200 dark:border-gray-700',
                  column.sortable && 'cursor-pointer select-none',
                  column.minWidth && `min-w-[${column.minWidth}]`,
                  column.maxWidth && `max-w-[${column.maxWidth}]`
                )}
                style={{
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                }}
                onClick={() => column.sortable && handleSort(column.id)}
                aria-sort={
                  sortState.find((sort) => sort.id === column.id)?.direction
                }
                aria-label={column.ariaLabel || column.header}
              >
                <div className="flex items-center space-x-2">
                  <span>{column.header}</span>
                  {column.sortable && (
                    <span className="flex flex-col">
                      <ChevronUp
                        className={cn('h-3 w-3', {
                          'text-gray-900 dark:text-gray-100':
                            sortState.find(
                              (sort) =>
                                sort.id === column.id && sort.direction === 'asc'
                            ),
                          'text-gray-400 dark:text-gray-500': !sortState.find(
                            (sort) =>
                              sort.id === column.id && sort.direction === 'asc'
                          ),
                        })}
                      />
                      <ChevronDown
                        className={cn('h-3 w-3', {
                          'text-gray-900 dark:text-gray-100':
                            sortState.find(
                              (sort) =>
                                sort.id === column.id && sort.direction === 'desc'
                            ),
                          'text-gray-400 dark:text-gray-500': !sortState.find(
                            (sort) =>
                              sort.id === column.id && sort.direction === 'desc'
                          ),
                        })}
                      />
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(virtualization?.enabled ? visibleRows : data).map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                'border-b border-gray-200 dark:border-gray-700',
                'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              )}
            >
              {columns.map((column) => {
                const value = column.accessor.toString().split('.').reduce(
                  (obj, key) => obj?.[key],
                  row
                );
                return (
                  <td
                    key={column.id}
                    className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300"
                  >
                    {column.render ? column.render(value, row) : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {renderPagination()}
    </div>
  );
};

export default Table;