import { AES, enc } from 'crypto-js'; // v4.1.1
import type { Session } from '../types/auth';
import type { UserPreferences } from '../types/profile';

// Storage keys for different data types
const STORAGE_KEYS = {
  SESSION: 'unbanked_session',
  PREFERENCES: 'unbanked_preferences',
  THEME: 'unbanked_theme',
  CACHE: 'unbanked_cache',
  ENCRYPTION_SALT: 'unbanked_salt'
} as const;

// Maximum storage size (5MB)
const MAX_STORAGE_SIZE = 5 * 1024 * 1024;

// Environment variable for encryption key
const ENCRYPTION_KEY = process.env.VITE_STORAGE_ENCRYPTION_KEY;

interface EncryptionOptions {
  useCompression?: boolean;
  expiresIn?: number;
}

interface StorageMetadata {
  size: number;
  lastAccessed: number;
  version: string;
  encrypted: boolean;
}

/**
 * Storage utility for secure client-side data management
 */
class SecureStorage {
  private metadata: Map<string, StorageMetadata>;
  private initialized: boolean;

  constructor() {
    this.metadata = new Map();
    this.initialized = false;
  }

  /**
   * Initializes the storage system with encryption setup
   */
  async initializeStorage(): Promise<void> {
    if (!ENCRYPTION_KEY) {
      throw new Error('Storage encryption key not configured');
    }

    if (this.initialized) return;

    // Initialize storage metadata
    this.initializeMetadata();

    // Set up storage event listeners for cross-tab sync
    window.addEventListener('storage', this.handleStorageEvent);

    // Perform initial cleanup
    await this.performStorageCleanup();

    this.initialized = true;
  }

  /**
   * Stores encrypted data in browser storage
   */
  setItem<T>(key: string, value: T, persistent = false, options: EncryptionOptions = {}): void {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    if (!Object.values(STORAGE_KEYS).includes(key as any)) {
      throw new Error('Invalid storage key');
    }

    try {
      const serializedValue = JSON.stringify(value);
      const salt = this.generateSalt();
      const encrypted = this.encrypt(serializedValue, salt);

      const storageValue = {
        data: encrypted,
        salt,
        timestamp: Date.now(),
        integrity: this.generateIntegrityHash(encrypted),
        metadata: {
          compressed: options.useCompression || false,
          expires: options.expiresIn ? Date.now() + options.expiresIn : null
        }
      };

      const storageString = JSON.stringify(storageValue);
      
      if (this.exceedsQuota(storageString.length)) {
        this.evictStaleData();
      }

      const storage = persistent ? localStorage : sessionStorage;
      storage.setItem(key, storageString);

      this.updateMetadata(key, {
        size: storageString.length,
        lastAccessed: Date.now(),
        version: '1.0',
        encrypted: true
      });

      // Notify other tabs
      this.broadcastStorageUpdate(key, storageValue);
    } catch (error) {
      console.error('Storage operation failed:', error);
      throw new Error('Failed to store data');
    }
  }

  /**
   * Retrieves and decrypts data with integrity verification
   */
  getItem<T>(key: string): T | null {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    try {
      const storageValue = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!storageValue) return null;

      const { data, salt, integrity, metadata } = JSON.parse(storageValue);

      // Verify data integrity
      if (this.generateIntegrityHash(data) !== integrity) {
        throw new Error('Data integrity check failed');
      }

      // Check expiration
      if (metadata.expires && metadata.expires < Date.now()) {
        this.removeItem(key);
        return null;
      }

      const decrypted = this.decrypt(data, salt);
      const parsed = JSON.parse(decrypted);

      // Update access timestamp
      this.updateMetadata(key, {
        ...this.metadata.get(key)!,
        lastAccessed: Date.now()
      });

      return parsed as T;
    } catch (error) {
      console.error('Failed to retrieve data:', error);
      return null;
    }
  }

  /**
   * Removes item from storage and updates quota tracking
   */
  removeItem(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    this.metadata.delete(key);
    this.broadcastStorageUpdate(key, null);
  }

  /**
   * Clears all application storage with proper cleanup
   */
  clearStorage(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      this.removeItem(key as string);
    });
    this.metadata.clear();
    this.broadcastStorageUpdate('clear', null);
  }

  /**
   * Stores encrypted session data with expiration handling
   */
  setSession(session: Session): void {
    this.setItem(STORAGE_KEYS.SESSION, session, false, {
      expiresIn: 15 * 60 * 1000 // 15 minutes
    });
  }

  /**
   * Retrieves and validates session with automatic cleanup
   */
  getSession(): Session | null {
    const session = this.getItem<Session>(STORAGE_KEYS.SESSION);
    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      this.removeItem(STORAGE_KEYS.SESSION);
      return null;
    }

    return session;
  }

  /**
   * Stores validated user preferences with backup
   */
  setPreferences(preferences: UserPreferences): void {
    this.setItem(STORAGE_KEYS.PREFERENCES, preferences, true);
  }

  /**
   * Retrieves user preferences with fallback values
   */
  getPreferences(): UserPreferences {
    const defaults: UserPreferences = {
      language: 'en',
      currency: 'USD',
      notifications_enabled: true,
      theme: 'system'
    };

    const stored = this.getItem<UserPreferences>(STORAGE_KEYS.PREFERENCES);
    return { ...defaults, ...stored };
  }

  // Private helper methods

  private encrypt(data: string, salt: string): string {
    return AES.encrypt(data, `${ENCRYPTION_KEY}${salt}`).toString();
  }

  private decrypt(encrypted: string, salt: string): string {
    const bytes = AES.decrypt(encrypted, `${ENCRYPTION_KEY}${salt}`);
    return bytes.toString(enc.Utf8);
  }

  private generateSalt(): string {
    return crypto.randomUUID();
  }

  private generateIntegrityHash(data: string): string {
    return AES.encrypt(data, ENCRYPTION_KEY).toString();
  }

  private exceedsQuota(size: number): boolean {
    const currentSize = Array.from(this.metadata.values())
      .reduce((total, meta) => total + meta.size, 0);
    return (currentSize + size) > MAX_STORAGE_SIZE;
  }

  private evictStaleData(): void {
    const entries = Array.from(this.metadata.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    for (const [key] of entries) {
      this.removeItem(key);
      if (!this.exceedsQuota(0)) break;
    }
  }

  private initializeMetadata(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      const value = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (value) {
        this.metadata.set(key, {
          size: value.length,
          lastAccessed: Date.now(),
          version: '1.0',
          encrypted: true
        });
      }
    });
  }

  private async performStorageCleanup(): Promise<void> {
    const cleanupTasks = Array.from(this.metadata.entries())
      .map(async ([key, meta]) => {
        const value = this.getItem(key);
        if (!value || (meta.lastAccessed + 7 * 24 * 60 * 60 * 1000) < Date.now()) {
          this.removeItem(key);
        }
      });

    await Promise.all(cleanupTasks);
  }

  private handleStorageEvent = (event: StorageEvent): void => {
    if (!event.key || !Object.values(STORAGE_KEYS).includes(event.key as any)) {
      return;
    }

    if (event.newValue === null) {
      this.metadata.delete(event.key);
    } else {
      const value = JSON.parse(event.newValue);
      this.updateMetadata(event.key, {
        size: event.newValue.length,
        lastAccessed: Date.now(),
        version: '1.0',
        encrypted: true
      });
    }
  };

  private broadcastStorageUpdate(key: string, value: any): void {
    window.dispatchEvent(new StorageEvent('storage', {
      key,
      newValue: value ? JSON.stringify(value) : null,
      storageArea: localStorage
    }));
  }

  private updateMetadata(key: string, metadata: StorageMetadata): void {
    this.metadata.set(key, metadata);
  }
}

// Export singleton instance
export const storage = new SecureStorage();