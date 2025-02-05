// External imports - v0.34.0
import { describe, it, expect, beforeEach, afterEach, jest } from 'vitest';
import { createClient } from '@supabase/supabase-js'; // v2.38.0
import { setupTestDb } from '@test/utils'; // v1.0.0

// Internal imports
import { registerUser, registrationSchema } from '../../functions/auth/register';
import { User, UserRole, KYCLevel } from '../../types/auth';
import { ValidationError } from '../../lib/common/errors';

// Test constants
const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'TestPassword123!';
const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL;
const TEST_SUPABASE_KEY = process.env.TEST_SUPABASE_KEY;

// Mock Supabase client
let supabaseClient: ReturnType<typeof createClient>;

// Mock request and response objects
const mockRequest = () => ({
  body: {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    gdpr_consent: true
  },
  headers: {
    'x-forwarded-for': '127.0.0.1'
  },
  socket: {
    remoteAddress: '127.0.0.1'
  }
});

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Test environment setup and cleanup
async function setupTestEnvironment(): Promise<void> {
  // Initialize test database client
  supabaseClient = createClient(TEST_SUPABASE_URL!, TEST_SUPABASE_KEY!);
  
  // Setup clean test database
  await setupTestDb();
  
  // Mock external services
  jest.mock('winston');
  jest.mock('argon2');
  
  // Reset rate limiters
  jest.mock('express-rate-limit');
}

async function cleanupTestEnvironment(): Promise<void> {
  // Clean up test data
  const { error } = await supabaseClient
    .from('users')
    .delete()
    .eq('email', TEST_USER_EMAIL);
  
  if (error) {
    console.error('Cleanup error:', error);
  }
  
  // Reset mocks
  jest.resetAllMocks();
  
  // Close database connection
  await supabaseClient.auth.signOut();
}

describe('User Registration Input Validation', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('should validate email format', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    // Test invalid email formats
    const invalidEmails = [
      'invalid-email',
      '@nodomain.com',
      'test@.com',
      'test@domain.',
      'test@domain'
    ];

    for (const email of invalidEmails) {
      req.body.email = email;
      await registerUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR'
          })
        })
      );
    }
  });

  it('should enforce password requirements', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    // Test invalid passwords
    const invalidPasswords = [
      'short', // Too short
      'nouppercase123!', // No uppercase
      'NOLOWERCASE123!', // No lowercase
      'NoSpecialChar123', // No special character
      'NoNumber!', // No number
      'a'.repeat(129) // Too long
    ];

    for (const password of invalidPasswords) {
      req.body.password = password;
      await registerUser(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR'
          })
        })
      );
    }
  });

  it('should require GDPR consent', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    // Test missing GDPR consent
    req.body.gdpr_consent = false;
    await registerUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('GDPR consent is required')
        })
      })
    );
  });
});

describe('User Registration Flow', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('should successfully register new user', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    await registerUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          user: expect.objectContaining({
            email: TEST_USER_EMAIL,
            role: UserRole.USER,
            kyc_level: KYCLevel.NONE
          })
        })
      })
    );

    // Verify user in database
    const { data: user } = await supabaseClient
      .from('users')
      .select('*')
      .eq('email', TEST_USER_EMAIL)
      .single();

    expect(user).toBeDefined();
    expect(user.gdpr_consent).toBe(true);
    expect(user.gdpr_consent_date).toBeDefined();
    expect(user.registration_ip).toBe('127.0.0.1');
  });

  it('should prevent duplicate registration', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    // First registration
    await registerUser(req, res);
    
    // Reset response mock
    res.status.mockClear();
    res.json.mockClear();
    
    // Attempt duplicate registration
    await registerUser(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          message: 'Email already registered'
        })
      })
    );
  });
});

describe('Security Measures', () => {
  beforeEach(setupTestEnvironment);
  afterEach(cleanupTestEnvironment);

  it('should properly hash passwords', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    await registerUser(req, res);
    
    // Verify password is hashed in database
    const { data: user } = await supabaseClient
      .from('users')
      .select('password_hash')
      .eq('email', TEST_USER_EMAIL)
      .single();

    expect(user.password_hash).toBeDefined();
    expect(user.password_hash).not.toBe(TEST_USER_PASSWORD);
    expect(user.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('should enforce rate limiting', async () => {
    const req = mockRequest();
    const res = mockResponse();
    
    // Attempt multiple registrations
    for (let i = 0; i < 6; i++) {
      req.body.email = `test${i}@example.com`;
      await registerUser(req, res);
    }
    
    // Last attempt should be rate limited
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error: expect.objectContaining({
          code: 'RATE_LIMIT'
        })
      })
    );
  });
});