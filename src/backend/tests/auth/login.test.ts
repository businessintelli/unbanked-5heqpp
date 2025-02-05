// External imports
import { describe, it, expect, beforeEach, afterEach, jest } from 'vitest';
import bcrypt from 'bcrypt'; // v5.1.0
import jsonwebtoken from 'jsonwebtoken'; // v9.0.0

// Internal imports
import { loginHandler } from '../../functions/auth/login';
import { LoginCredentials, User, UserRole, KYCLevel } from '../../types/auth';
import { ErrorCode } from '../../types/common';

// Test constants
const TEST_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq...';
const TEST_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhki...';
const TEST_DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const TEST_IP_ADDRESS = '192.168.1.1';
const TEST_USER_AGENT = 'Mozilla/5.0 (Test Browser)';

// Mock implementations
jest.mock('@supabase/edge-functions', () => ({
  rateLimit: (config: any, handler: any) => handler
}));

jest.mock('winston', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    json: jest.fn()
  },
  transports: {
    File: jest.fn()
  }
}));

// Test utilities
async function setupTestUser(userData: Partial<User> = {}): Promise<User> {
  const password = 'Test@123456';
  const passwordHash = await bcrypt.hash(password, 10);

  const user: User = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    password_hash: passwordHash,
    role: UserRole.USER,
    kyc_level: KYCLevel.BASIC,
    mfa_enabled: false,
    mfa_secret: null,
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
    last_modified_by: 'system',
    ...userData
  };

  // Mock database insert
  global.supabase = {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: user })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: user })
      })
    })
  } as any;

  return user;
}

async function createTestRequest(credentials: Partial<LoginCredentials> = {}): Promise<Request> {
  const defaultCredentials: LoginCredentials = {
    email: 'test@example.com',
    password: 'Test@123456',
    device_id: TEST_DEVICE_ID,
    mfa_code: undefined
  };

  return new Request('http://localhost/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': TEST_IP_ADDRESS,
      'User-Agent': TEST_USER_AGENT
    },
    body: JSON.stringify({ ...defaultCredentials, ...credentials })
  });
}

describe('Login Handler Security Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY;
  });

  afterEach(() => {
    // Clean up after each test
    jest.resetModules();
  });

  it('should successfully login with valid credentials and security context', async () => {
    // Setup
    const user = await setupTestUser();
    const request = await createTestRequest();

    // Execute
    const response = await loginHandler(request);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(responseData).toHaveProperty('accessToken');
    expect(responseData).toHaveProperty('refreshToken');
    expect(responseData.user).toEqual({
      id: user.id,
      email: user.email,
      role: user.role,
      kyc_level: user.kyc_level
    });

    // Verify JWT claims
    const decodedToken = jsonwebtoken.verify(responseData.accessToken, TEST_PUBLIC_KEY) as any;
    expect(decodedToken.user_id).toBe(user.id);
    expect(decodedToken.device_id).toBe(TEST_DEVICE_ID);
    expect(decodedToken.ip_address).toBe(TEST_IP_ADDRESS);
  });

  it('should enforce MFA when enabled', async () => {
    // Setup
    const user = await setupTestUser({
      mfa_enabled: true,
      mfa_secret: 'JBSWY3DPEHPK3PXP'
    });

    // Test MFA challenge response
    const initialRequest = await createTestRequest();
    const challengeResponse = await loginHandler(initialRequest);
    const challengeData = await challengeResponse.json();

    expect(challengeResponse.status).toBe(200);
    expect(challengeData.requiresMFA).toBe(true);

    // Test invalid MFA code
    const invalidMfaRequest = await createTestRequest({ mfa_code: '000000' });
    const invalidMfaResponse = await loginHandler(invalidMfaRequest);

    expect(invalidMfaResponse.status).toBe(401);

    // Test valid MFA code
    const validMfaRequest = await createTestRequest({ mfa_code: '123456' });
    const validMfaResponse = await loginHandler(validMfaRequest);
    const validMfaData = await validMfaResponse.json();

    expect(validMfaResponse.status).toBe(200);
    expect(validMfaData).toHaveProperty('accessToken');
  });

  it('should enforce rate limiting', async () => {
    // Setup
    await setupTestUser();
    const request = await createTestRequest();

    // Simulate multiple rapid requests
    const attempts = Array(11).fill(request);
    const responses = await Promise.all(attempts.map(req => loginHandler(req)));

    // Verify rate limit enforcement
    const lastResponse = responses[responses.length - 1];
    const lastResponseData = await lastResponse.json();

    expect(lastResponse.status).toBe(429);
    expect(lastResponseData.error.code).toBe(ErrorCode.RATE_LIMIT);
  });

  it('should handle security edge cases', async () => {
    // Setup
    const user = await setupTestUser({
      failed_login_attempts: 4,
      last_failed_login: new Date()
    });

    // Test account lockout
    const invalidRequest = await createTestRequest({ password: 'WrongPass@123' });
    const lockoutResponse = await loginHandler(invalidRequest);
    const lockoutData = await lockoutResponse.json();

    expect(lockoutResponse.status).toBe(401);
    expect(lockoutData.error.code).toBe(ErrorCode.UNAUTHORIZED);

    // Verify progressive lockout
    const updatedUser = await global.supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    expect(updatedUser.data.account_locked_until).toBeTruthy();
    expect(updatedUser.data.failed_login_attempts).toBe(5);
  });

  it('should validate concurrent sessions', async () => {
    // Setup
    await setupTestUser();
    const request = await createTestRequest();

    // Mock active sessions
    global.supabase.from('active_sessions').select = jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue({ count: 3 }),
      eq: jest.fn().mockReturnThis()
    });

    // Test concurrent session limit
    const response = await loginHandler(request);
    const responseData = await response.json();

    expect(response.status).toBe(403);
    expect(responseData.error.code).toBe(ErrorCode.FORBIDDEN);
    expect(responseData.error.message).toBe('Maximum concurrent sessions reached');
  });
});