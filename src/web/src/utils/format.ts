import { truncate, memoize } from 'lodash'; // v4.17.21
import { formatFiatCurrency } from './currency';
import { formatTransactionDate } from './date';

// Constants for formatting configuration
const ADDRESS_TRUNCATE_LENGTH = 8;
const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const PHONE_NUMBER_FORMATS = {
  US: "(xxx) xxx-xxxx",
  UK: "xxxx xxx xxxx"
};
const ADDRESS_REGEX_PATTERNS = {
  ETH: "^0x[a-fA-F0-9]{40}$",
  BTC: "^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$"
};

/**
 * Formats a cryptocurrency wallet address for secure display with RTL support
 * @param address - The wallet address to format
 * @param length - Optional custom truncation length
 * @param options - Optional formatting options
 * @returns Formatted address string with proper RTL support
 */
export const formatAddress = memoize((
  address: string,
  length: number = ADDRESS_TRUNCATE_LENGTH,
  options: {
    showChecksum?: boolean;
    rtl?: boolean;
    addEllipsis?: boolean;
  } = {}
): string => {
  // Validate address format
  const addressType = Object.entries(ADDRESS_REGEX_PATTERNS).find(([_, pattern]) => 
    new RegExp(pattern).test(address)
  )?.[0];

  if (!addressType) {
    throw new Error('Invalid cryptocurrency address format');
  }

  // Sanitize input to prevent XSS
  const sanitizedAddress = address.replace(/[<>&"']/g, '');

  // Apply RTL markers if needed
  const rtlMarker = options.rtl ? '\u202B' : '';
  const rtlEnd = options.rtl ? '\u202C' : '';

  // Truncate address with proper handling
  const start = sanitizedAddress.slice(0, length);
  const end = sanitizedAddress.slice(-length);
  const ellipsis = options.addEllipsis !== false ? '...' : '';

  // Add visual security indicators
  const formattedAddress = `${rtlMarker}${start}${ellipsis}${end}${rtlEnd}`;

  // Add ARIA label for accessibility
  return `<span aria-label="Cryptocurrency address ${addressType}">${formattedAddress}</span>`;
});

/**
 * Formats a number as a percentage string with locale support and precision control
 * @param value - The number to format as percentage
 * @param decimals - Number of decimal places
 * @param localeOptions - Optional locale formatting options
 * @returns Formatted percentage string
 */
export const formatPercentage = memoize((
  value: number,
  decimals: number = 2,
  localeOptions: Intl.NumberFormatOptions = {}
): string => {
  // Validate numeric input
  if (!Number.isFinite(value)) {
    throw new Error('Invalid numeric value for percentage formatting');
  }

  // Handle negative values
  const isNegative = value < 0;
  const absoluteValue = Math.abs(value);

  // Format with locale support
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: isNegative ? 'negative' : 'auto',
    ...localeOptions
  });

  // Add ARIA label for accessibility
  return `<span aria-label="${value.toFixed(decimals)}%">${formatter.format(absoluteValue / 100)}</span>`;
});

/**
 * Formats a file size with intelligent unit selection and localization
 * @param bytes - The file size in bytes
 * @param localeOptions - Optional locale formatting options
 * @returns Formatted file size string
 */
export const formatFileSize = memoize((
  bytes: number,
  localeOptions: Intl.NumberFormatOptions = {}
): string => {
  // Validate bytes input
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new Error('Invalid file size value');
  }

  // Handle zero case
  if (bytes === 0) {
    return '0 B';
  }

  // Determine appropriate unit
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = FILE_SIZE_UNITS[unitIndex];
  const value = bytes / Math.pow(1024, unitIndex);

  // Format with locale support
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    ...localeOptions
  });

  // Add ARIA label for accessibility
  return `<span aria-label="${formatter.format(value)} ${unit}">${formatter.format(value)} ${unit}</span>`;
});

/**
 * Formats phone numbers with international support and validation
 * @param phoneNumber - The phone number to format
 * @param countryCode - The country code for formatting rules
 * @returns Formatted phone number string
 */
export const formatPhoneNumber = memoize((
  phoneNumber: string,
  countryCode: string = 'US'
): string => {
  // Remove non-numeric characters
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Validate phone number format
  if (!/^\d{10,15}$/.test(cleaned)) {
    throw new Error('Invalid phone number format');
  }

  // Get country-specific format
  const format = PHONE_NUMBER_FORMATS[countryCode as keyof typeof PHONE_NUMBER_FORMATS] || 
    PHONE_NUMBER_FORMATS.US;

  // Apply formatting
  let formatted = format;
  let digitIndex = 0;

  for (let i = 0; i < format.length && digitIndex < cleaned.length; i++) {
    if (format[i] === 'x') {
      formatted = formatted.replace('x', cleaned[digitIndex]);
      digitIndex++;
    }
  }

  // Add international prefix
  const prefix = countryCode === 'US' ? '+1 ' : '';

  // Add ARIA label for accessibility
  return `<span aria-label="Phone number ${prefix}${formatted}">${prefix}${formatted}</span>`;
});