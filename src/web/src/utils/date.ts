import { format, formatDistance, parseISO } from 'date-fns'; // v2.30.0
import type { Locale } from 'date-fns';

// Global constants for date formatting
const DEFAULT_DATE_FORMAT = 'MMM dd, yyyy';
const DEFAULT_TIME_FORMAT = 'HH:mm:ss';
const DEFAULT_DATETIME_FORMAT = 'MMM dd, yyyy HH:mm:ss';
const DATE_CACHE_SIZE = 100;
const DATE_CACHE_TTL = 60000; // 60 seconds in milliseconds

// Custom error for date parsing/validation
class DateParsingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateParsingError';
  }
}

// Memoization decorator implementation
function memoize(cacheSize: number, ttl: number) {
  const cache = new Map<string, { value: string; timestamp: number }>();

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const key = JSON.stringify(args);
      const now = Date.now();

      // Check cache and TTL
      const cached = cache.get(key);
      if (cached && now - cached.timestamp < ttl) {
        return cached.value;
      }

      // Execute original method
      const result = originalMethod.apply(this, args);

      // Update cache
      cache.set(key, { value: result, timestamp: now });

      // Maintain cache size
      if (cache.size > cacheSize) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Safely parses a date string or object into a validated Date object
 * @param input - Date string or Date object to parse
 * @throws {DateParsingError} If the input is invalid or cannot be parsed
 * @returns Validated Date object
 */
export function parseDate(input: string | Date): Date {
  if (!input) {
    throw new DateParsingError('Date input cannot be null or undefined');
  }

  if (input instanceof Date) {
    if (!isValidDate(input)) {
      throw new DateParsingError('Invalid Date object provided');
    }
    return input;
  }

  try {
    const parsedDate = parseISO(input);
    if (!isValidDate(parsedDate)) {
      throw new DateParsingError('Invalid date string format');
    }
    return parsedDate;
  } catch (error) {
    throw new DateParsingError(
      `Failed to parse date string: ${(error as Error).message}`
    );
  }
}

/**
 * Validates a date string or object with timezone consideration
 * @param input - Date string or Date object to validate
 * @returns Boolean indicating if the date is valid
 */
export function isValidDate(input: string | Date): boolean {
  if (!input) return false;

  const date = input instanceof Date ? input : parseISO(input);
  
  // Check if date is valid and has valid components
  if (
    Object.prototype.toString.call(date) !== '[object Date]' ||
    isNaN(date.getTime())
  ) {
    return false;
  }

  // Validate date components are within reasonable ranges
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  return (
    year >= 1900 && 
    year <= 2100 && 
    month >= 0 && 
    month <= 11 && 
    day >= 1 && 
    day <= 31
  );
}

/**
 * Formats a date for transaction display with locale support and memoization
 * @param date - Date to format
 * @param formatString - Optional custom format string
 * @param locale - Optional locale for formatting
 * @returns Formatted date string
 */
@memoize(DATE_CACHE_SIZE, DATE_CACHE_TTL)
export function formatTransactionDate(
  date: Date | string,
  formatString?: string,
  locale?: Locale
): string {
  try {
    const validDate = parseDate(date);
    const dateFormat = formatString || DEFAULT_DATETIME_FORMAT;

    return format(validDate, dateFormat, { locale });
  } catch (error) {
    console.error('Error formatting transaction date:', error);
    throw new DateParsingError(
      `Failed to format transaction date: ${(error as Error).message}`
    );
  }
}

/**
 * Formats a date as a relative time string with locale support
 * @param date - Date to format
 * @param locale - Optional locale for formatting
 * @returns Localized relative time string
 */
@memoize(DATE_CACHE_SIZE, DATE_CACHE_TTL)
export function formatRelativeTime(
  date: Date | string,
  locale?: Locale
): string {
  try {
    const validDate = parseDate(date);
    const now = new Date();

    return formatDistance(validDate, now, {
      addSuffix: true,
      locale,
    });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    throw new DateParsingError(
      `Failed to format relative time: ${(error as Error).message}`
    );
  }
}