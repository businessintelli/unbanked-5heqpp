import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'; // v0.34.0
import { performance } from 'perf_hooks'; // node:built-in
import { SecurityUtils } from '@security/utils'; // v1.0.0

import { useAuth } from '../../src/hooks/useAuth';
import { User, UserRole, KYCLevel } from '../../src/types/auth';

// Mock response data
const mockUser: User = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  role: UserRole.USER,
  kyc_level: KYCLevel.BASIC,
  mfa_enabled: true,
  last_login: new Date(),
  security_level: 50,
  session_expires: new Date(Date.now() + 3600000)
};

// Performance thresholds
const PERFORMANCE_THRESHOLD = 500; // 500ms as per requirements

describe('useAuth Hook', () => {
  // Mock fetch globally
  const mockFetch = vi.fn();
  global.fetch = mockFetch;
  
  // Mock crypto API
  const mockCrypto = {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
    }
  };
  global.crypto = mockCrypto as any;

  // Mock localStorage
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  };
  global.localStorage = mockLocalStorage as any;

  // Mock performance monitoring
  const performanceMetrics: { [key: string]: number[] } = {};
  const recordPerformance = (operation: string, duration: number) => {
    if (!performanceMetrics[operation]) {
      performanceMetrics[operation] = [];
    }
    performanceMetrics[operation].push(duration);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    performanceMetrics.clear;
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should initialize in unauthenticated state', () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle successful login with performance monitoring', async () => {
    const startTime = performance.now();
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: mockUser,
        access_token: 'mock_access_token',
        refresh_token: 'mock_refresh_token'
      })
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        device_id: 'mock_device_id'
      });
    });

    const duration = performance.now() - startTime;
    recordPerformance('login', duration);

    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should handle MFA verification correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ verified: true })
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const verified = await result.current.verifyMFA('123456', 'totp');
      expect(verified).toBe(true);
      expect(result.current.securityLevel).toBe('high');
    });
  });

  it('should manage token rotation within performance constraints', async () => {
    const startTime = performance.now();
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token'
      })
    });

    const { result } = renderHook(() => useAuth());
    
    // Set initial session state
    await act(async () => {
      result.current.session = {
        token: 'old_token',
        refresh_token: 'old_refresh_token',
        deviceId: 'mock_device_id',
        lastRefresh: new Date(Date.now() - 15 * 60 * 1000)
      };
    });

    // Trigger token refresh
    vi.advanceTimersByTime(14 * 60 * 1000); // 14 minutes

    const duration = performance.now() - startTime;
    recordPerformance('tokenRefresh', duration);

    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD);
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.any(Object));
  });

  it('should handle KYC verification and status updates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        user: { ...mockUser, kyc_level: KYCLevel.VERIFIED }
      })
    });

    const { result } = renderHook(() => useAuth());
    const mockFormData = new FormData();

    await act(async () => {
      await result.current.updateKYC(mockFormData);
    });

    expect(result.current.kycStatus).toBe('pending');
    expect(mockFetch).toHaveBeenCalledWith('/api/kyc/update', expect.any(Object));
  });

  it('should enforce session timeout security', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.session = {
        token: 'test_token',
        refresh_token: 'test_refresh_token',
        deviceId: 'mock_device_id',
        lastRefresh: new Date()
      };
    });

    // Advance time beyond session timeout
    vi.advanceTimersByTime(31 * 60 * 1000); // 31 minutes

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.session).toBeNull();
  });

  it('should handle secure logout with session cleanup', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.securityLevel).toBe('low');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', expect.any(Object));
  });

  it('should validate device fingerprint during session restoration', async () => {
    const mockStoredSession = {
      deviceId: 'stored_device_id',
      token: 'stored_token',
      refresh_token: 'stored_refresh_token'
    };

    mockLocalStorage.getItem.mockReturnValue(JSON.stringify(mockStoredSession));
    mockCrypto.subtle.digest.mockResolvedValueOnce(new Uint8Array([5, 6, 7, 8]));

    const { result } = renderHook(() => useAuth());

    expect(result.current.error).not.toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  // Performance monitoring summary
  afterAll(() => {
    Object.entries(performanceMetrics).forEach(([operation, durations]) => {
      const average = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`${operation} average duration: ${average}ms`);
      expect(average).toBeLessThan(PERFORMANCE_THRESHOLD);
    });
  });
});