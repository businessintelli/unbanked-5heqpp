// External imports
import { describe, it, expect, beforeEach, afterEach } from 'vitest'; // ^0.34.0
import speakeasy from 'speakeasy'; // ^2.0.0

// Internal imports
import { generateMFASecret, validateMFAToken, enableMFA, disableMFA } from '../../lib/auth/mfa';
import { User } from '../../types/auth';
import { UnauthorizedError } from '../../lib/common/errors';

// Test constants
const TEST_USER_EMAIL = 'test@unbanked.com';
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ISSUER = 'Unbanked';
const INVALID_TOKEN = '000000';

/**
 * Creates a mock user object for testing MFA functionality
 */
function generateTestUser(mfaEnabled: boolean = false, mfaSecret: string | null = null, backupCodes: string[] = []): User {
  return {
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    password_hash: 'hashed_password',
    role: 'USER',
    kyc_level: 0,
    mfa_enabled: mfaEnabled,
    mfa_secret: mfaSecret,
    mfa_backup_codes: backupCodes,
    mfa_recovery_email: 'recovery@unbanked.com',
    last_login: null,
    failed_login_attempts: 0,
    last_failed_login: null,
    account_locked_until: null,
    gdpr_consent: true,
    gdpr_consent_date: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    version: 1,
    last_modified_by: TEST_USER_ID
  };
}

describe('MFA Secret Generation', () => {
  it('should generate cryptographically secure MFA secret', async () => {
    const result = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    
    expect(result.secret).toBeDefined();
    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
    expect(result.secret.length).toBeGreaterThanOrEqual(32);
  });

  it('should generate valid QR code URL with correct parameters', async () => {
    const result = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    
    expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.otpauthUrl).toContain(encodeURIComponent(TEST_USER_EMAIL));
    expect(result.otpauthUrl).toContain(encodeURIComponent(ISSUER));
  });

  it('should generate unique secrets for different users', async () => {
    const result1 = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    const result2 = await generateMFASecret('another-id', 'another@unbanked.com');
    
    expect(result1.secret).not.toBe(result2.secret);
  });

  it('should handle special characters in email addresses', async () => {
    const specialEmail = 'test+special@unbanked.com';
    const result = await generateMFASecret(TEST_USER_ID, specialEmail);
    
    expect(result.otpauthUrl).toContain(encodeURIComponent(specialEmail));
  });
});

describe('MFA Token Validation', () => {
  let testSecret: string;
  let testUser: User;

  beforeEach(async () => {
    const result = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    testSecret = result.secret;
    testUser = generateTestUser(true, testSecret);
  });

  it('should validate correct TOTP token within time window', async () => {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    const isValid = await validateMFAToken(token, testSecret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid TOTP token format', async () => {
    await expect(validateMFAToken('12345', testSecret))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should reject expired TOTP token', async () => {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512',
      time: Date.now() / 1000 - 60 // Generate token from 1 minute ago
    });

    const isValid = await validateMFAToken(token, testSecret);
    expect(isValid).toBe(false);
  });

  it('should handle token reuse attempts', async () => {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    // First validation should succeed
    const firstAttempt = await validateMFAToken(token, testSecret);
    expect(firstAttempt).toBe(true);

    // Immediate reuse should still work within time window
    const secondAttempt = await validateMFAToken(token, testSecret);
    expect(secondAttempt).toBe(true);
  });

  it('should validate token time skew', async () => {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512',
      time: Date.now() / 1000 + 30 // Generate token for 30 seconds in future
    });

    const isValid = await validateMFAToken(token, testSecret);
    expect(isValid).toBe(true);
  });
});

describe('MFA Enable/Disable', () => {
  let testUser: User;
  let testSecret: string;

  beforeEach(async () => {
    const result = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    testSecret = result.secret;
    testUser = generateTestUser(false, null);
  });

  it('should enable MFA with valid setup token', async () => {
    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    await enableMFA(testUser, testSecret, token);
    
    expect(testUser.mfa_enabled).toBe(true);
    expect(testUser.mfa_secret).toBe(testSecret);
  });

  it('should reject invalid setup token when enabling', async () => {
    await expect(enableMFA(testUser, testSecret, INVALID_TOKEN))
      .rejects.toThrow(UnauthorizedError);
    
    expect(testUser.mfa_enabled).toBe(false);
    expect(testUser.mfa_secret).toBeNull();
  });

  it('should prevent enabling MFA when already enabled', async () => {
    testUser.mfa_enabled = true;
    testUser.mfa_secret = testSecret;

    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    await expect(enableMFA(testUser, testSecret, token))
      .rejects.toThrow('MFA is already enabled');
  });

  it('should disable MFA with valid confirmation', async () => {
    testUser.mfa_enabled = true;
    testUser.mfa_secret = testSecret;

    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    await disableMFA(testUser, token);
    
    expect(testUser.mfa_enabled).toBe(false);
    expect(testUser.mfa_secret).toBeNull();
  });

  it('should reject invalid token when disabling', async () => {
    testUser.mfa_enabled = true;
    testUser.mfa_secret = testSecret;

    await expect(disableMFA(testUser, INVALID_TOKEN))
      .rejects.toThrow(UnauthorizedError);
    
    expect(testUser.mfa_enabled).toBe(true);
    expect(testUser.mfa_secret).toBe(testSecret);
  });
});

describe('Error Handling', () => {
  let testUser: User;
  let testSecret: string;

  beforeEach(async () => {
    const result = await generateMFASecret(TEST_USER_ID, TEST_USER_EMAIL);
    testSecret = result.secret;
    testUser = generateTestUser(false, null);
  });

  it('should throw UnauthorizedError for invalid tokens', async () => {
    await expect(validateMFAToken('invalid', testSecret))
      .rejects.toThrow(UnauthorizedError);
  });

  it('should handle missing MFA secret', async () => {
    testUser.mfa_enabled = true;
    testUser.mfa_secret = null;

    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    await expect(disableMFA(testUser, token))
      .rejects.toThrow('MFA is not enabled');
  });

  it('should handle invalid user states', async () => {
    testUser.mfa_enabled = false;

    const token = speakeasy.totp({
      secret: testSecret,
      encoding: 'base32',
      algorithm: 'sha512'
    });

    await expect(disableMFA(testUser, token))
      .rejects.toThrow('MFA is not enabled');
  });

  afterEach(() => {
    // Clean up any sensitive data
    testSecret = '';
    testUser.mfa_secret = null;
  });
});