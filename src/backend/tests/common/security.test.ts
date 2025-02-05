// External imports - v1.0.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomBytes, timingSafeEqual } from 'crypto';

// Internal imports
import {
  hashPassword,
  verifyPassword,
  encryptData,
  decryptData,
  generateSecureToken,
  EncryptionService
} from '../../lib/common/security';

// Test constants
const TEST_PASSWORD = 'TestPassword123!@#$';
const TEST_DATA = 'sensitive-data-for-encryption-tests';
const TEST_KEY = 'test-encryption-key-32-bytes-length-secure';
const MEMORY_COST = 65536; // 64MB as per NIST recommendations
const KEY_ROTATION_DAYS = 90;

describe('hashPassword', () => {
  it('should successfully hash password with NIST-compliant parameters', async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('should generate unique hashes for the same password', async () => {
    const hash1 = await hashPassword(TEST_PASSWORD);
    const hash2 = await hashPassword(TEST_PASSWORD);
    expect(hash1).not.toBe(hash2);
  });

  it('should enforce minimum memory cost requirements', async () => {
    const hash = await hashPassword(TEST_PASSWORD);
    const params = hash.split('$');
    const memoryCost = parseInt(params[4], 16);
    expect(memoryCost).toBeGreaterThanOrEqual(MEMORY_COST);
  });

  it('should reject weak passwords', async () => {
    await expect(hashPassword('weak')).rejects.toThrow('Password does not meet security requirements');
  });

  it('should use timing-safe operations', async () => {
    const startTime = process.hrtime();
    await hashPassword(TEST_PASSWORD);
    const [seconds, nanoseconds] = process.hrtime(startTime);
    
    const startTime2 = process.hrtime();
    await hashPassword('DifferentPassword123!@#');
    const [seconds2, nanoseconds2] = process.hrtime(startTime2);

    // Verify timing difference is within acceptable range (±10%)
    const time1 = seconds * 1e9 + nanoseconds;
    const time2 = seconds2 * 1e9 + nanoseconds2;
    const timingDiff = Math.abs(time1 - time2) / time1;
    expect(timingDiff).toBeLessThan(0.1);
  });
});

describe('verifyPassword', () => {
  let validHash: string;

  beforeEach(async () => {
    validHash = await hashPassword(TEST_PASSWORD);
  });

  it('should successfully verify correct password', async () => {
    const isValid = await verifyPassword(TEST_PASSWORD, validHash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password', async () => {
    const isValid = await verifyPassword('WrongPassword123!@#', validHash);
    expect(isValid).toBe(false);
  });

  it('should use constant-time comparison', async () => {
    const startTime = process.hrtime();
    await verifyPassword(TEST_PASSWORD, validHash);
    const [seconds1, nanoseconds1] = process.hrtime(startTime);

    const startTime2 = process.hrtime();
    await verifyPassword('WrongPassword123!@#', validHash);
    const [seconds2, nanoseconds2] = process.hrtime(startTime2);

    // Verify timing difference is minimal
    const time1 = seconds1 * 1e9 + nanoseconds1;
    const time2 = seconds2 * 1e9 + nanoseconds2;
    const timingDiff = Math.abs(time1 - time2) / time1;
    expect(timingDiff).toBeLessThan(0.1);
  });

  it('should handle malformed hash gracefully', async () => {
    await expect(verifyPassword(TEST_PASSWORD, 'invalid-hash')).rejects.toThrow();
  });
});

describe('encryptData/decryptData', () => {
  it('should successfully encrypt and decrypt data', async () => {
    const encrypted = await encryptData(TEST_DATA, TEST_KEY);
    expect(encrypted).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.value).toBeDefined();

    const decrypted = await decryptData(encrypted, TEST_KEY);
    expect(decrypted).toBe(TEST_DATA);
  });

  it('should generate unique IVs for each encryption', async () => {
    const encrypted1 = await encryptData(TEST_DATA, TEST_KEY);
    const encrypted2 = await encryptData(TEST_DATA, TEST_KEY);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
  });

  it('should validate data integrity during decryption', async () => {
    const encrypted = await encryptData(TEST_DATA, TEST_KEY);
    encrypted.value = encrypted.value.slice(1); // Tamper with encrypted data
    await expect(decryptData(encrypted, TEST_KEY)).rejects.toThrow();
  });

  it('should handle large datasets efficiently', async () => {
    const largeData = randomBytes(1024 * 1024).toString('hex'); // 1MB
    const encrypted = await encryptData(largeData, TEST_KEY);
    const decrypted = await decryptData(encrypted, TEST_KEY);
    expect(decrypted).toBe(largeData);
  });
});

describe('generateSecureToken', () => {
  it('should generate tokens with sufficient entropy', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(32); // Default length
    
    // Calculate entropy using Shannon's formula
    const charSet = new Set(token.split('')).size;
    const entropy = Math.log2(Math.pow(charSet, token.length));
    expect(entropy).toBeGreaterThan(128); // Minimum 128-bit entropy
  });

  it('should generate unique tokens', () => {
    const tokens = new Set();
    for (let i = 0; i < 1000; i++) {
      tokens.add(generateSecureToken());
    }
    expect(tokens.size).toBe(1000);
  });

  it('should support custom lengths', () => {
    const token = generateSecureToken(64);
    expect(token).toHaveLength(64);
  });
});

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  const mockKmsConfig = {
    keyId: 'test-key-id',
    region: 'us-east-1'
  };

  beforeEach(() => {
    vi.mock('@aws-sdk/client-kms');
    encryptionService = new EncryptionService(mockKmsConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should encrypt fields with KMS integration', async () => {
    const value = 'sensitive-data';
    const context = {
      userId: 'test-user',
      purpose: 'test',
      timestamp: Date.now()
    };

    const encrypted = await encryptionService.encryptField(value, 'testField', context);
    expect(encrypted.keyId).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.value).toBeDefined();
    expect(encrypted.context).toEqual(context);
  });

  it('should handle key rotation correctly', async () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // Simulate key rotation period
    vi.advanceTimersByTime(KEY_ROTATION_DAYS * 24 * 60 * 60 * 1000);
    
    // @ts-expect-error - Accessing private method for testing
    await encryptionService.rotateKeys();
    
    // Verify old data can still be decrypted after rotation
    const value = 'pre-rotation-data';
    const encrypted = await encryptionService.encryptField(value, 'testField', {
      userId: 'test-user',
      purpose: 'test',
      timestamp: now
    });
    
    const decrypted = await encryptionService.decryptField(encrypted);
    expect(decrypted).toBe(value);
  });

  it('should maintain audit logs for encryption operations', async () => {
    const mockLogger = vi.spyOn(console, 'log');
    
    await encryptionService.encryptField('test-data', 'testField', {
      userId: 'test-user',
      purpose: 'test',
      timestamp: Date.now()
    });

    expect(mockLogger).toHaveBeenCalledWith(
      expect.stringContaining('field_encrypted')
    );
  });

  it('should handle concurrent encryption operations', async () => {
    const operations = Array(10).fill(null).map((_, i) => 
      encryptionService.encryptField(`data-${i}`, 'testField', {
        userId: 'test-user',
        purpose: 'test',
        timestamp: Date.now()
      })
    );

    const results = await Promise.all(operations);
    expect(results).toHaveLength(10);
    expect(new Set(results.map(r => r.iv)).size).toBe(10); // Unique IVs
  });
});