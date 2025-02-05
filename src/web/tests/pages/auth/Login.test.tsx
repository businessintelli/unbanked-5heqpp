import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';

import Login from '../../src/pages/auth/Login';
import LoginForm from '../../src/components/auth/LoginForm';
import { useAuth } from '../../src/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn()
}));

vi.mock('../../src/hooks/useAuth', () => ({
  useAuth: vi.fn()
}));

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        visitorId: 'test-device-id',
        components: {
          emulator: false,
          tor: false,
          proxy: false,
          languages: ['en-US'],
          timezone: 'America/New_York'
        }
      })
    })
  }
}));

// Test data
const validCredentials = {
  email: 'test@example.com',
  password: 'Password123!@#',
  deviceId: 'test-device-id'
};

const mockNavigate = vi.fn();

describe('Login Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default auth mock
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      mfaRequired: false,
      kycLevel: 0,
      login: vi.fn(),
      handleMFAChallenge: vi.fn()
    });

    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);

    // Reset DOM
    document.body.innerHTML = '';
  });

  it('should render login form with proper accessibility attributes', async () => {
    const { container } = render(<Login />);

    // Check form accessibility
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Verify ARIA labels and roles
    expect(screen.getByRole('form', { name: /login/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-required', 'true');
  });

  it('should validate form fields and display error messages', async () => {
    const user = userEvent.setup();
    render(<Login />);

    // Submit empty form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Check validation messages
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();

    // Test invalid email format
    await user.type(screen.getByLabelText(/email/i), 'invalid-email');
    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();
  });

  it('should handle successful login flow', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      user: { id: '1', kycLevel: 2 },
      mfaRequired: false
    });

    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin
    });

    const user = userEvent.setup();
    const { container } = render(<Login />);

    // Fill form
    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);

    // Start performance measurement
    const startTime = performance.now();

    // Submit form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify loading state
    expect(screen.getByRole('status')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        ...validCredentials,
        rememberDevice: false
      });
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    // Verify response time
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(500);
  });

  it('should handle MFA challenge flow', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      mfaRequired: true,
      mfaChallenge: {
        type: 'totp',
        userId: '1'
      }
    });

    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      mfaRequired: true
    });

    const user = userEvent.setup();
    render(<Login />);

    // Submit valid credentials
    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/mfa');
    });
  });

  it('should handle rate limiting', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Too many attempts'));
    
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin
    });

    const user = userEvent.setup();
    render(<Login />);

    // Attempt multiple logins
    for (let i = 0; i < 6; i++) {
      await user.type(screen.getByLabelText(/email/i), validCredentials.email);
      await user.type(screen.getByLabelText(/password/i), validCredentials.password);
      await user.click(screen.getByRole('button', { name: /sign in/i }));
    }

    expect(await screen.findByText(/too many login attempts/i)).toBeInTheDocument();
  });

  it('should handle device fingerprinting', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      user: { id: '1' },
      deviceId: 'test-device-id'
    });

    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin
    });

    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({
        deviceId: 'test-device-id'
      }));
    });
  });

  it('should be keyboard accessible', async () => {
    const user = userEvent.setup();
    render(<Login />);

    // Navigate through form with keyboard
    await user.tab();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/password/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('checkbox', { name: /remember/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: /sign in/i })).toHaveFocus();
  });

  it('should handle network errors gracefully', async () => {
    const mockLogin = vi.fn().mockRejectedValue(new Error('Network error'));
    
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin
    });

    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
  });

  it('should redirect authenticated users', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });

    render(<Login />);

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });

  it('should handle session timeout', async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      user: { id: '1' },
      sessionExpires: new Date(Date.now() - 1000)
    });

    (useAuth as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin
    });

    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/session expired/i)).toBeInTheDocument();
  });
});