import React from 'react'; // ^18.2.0
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^14.0.0
import userEvent from '@testing-library/user-event'; // ^14.0.0
import { vi } from 'vitest'; // ^0.34.0
import { axe, toHaveNoViolations } from 'jest-axe'; // ^4.7.3
import LoginForm from '../../../../src/components/auth/LoginForm';
import { useAuth } from '../../../../src/hooks/useAuth';
import type { LoginCredentials, AuthResponse, MFAChallenge } from '../../../../src/types/auth';

// Extend expect with accessibility matchers
expect.extend(toHaveNoViolations);

// Mock the useAuth hook
vi.mock('../../../../src/hooks/useAuth');

describe('LoginForm', () => {
  // Test data
  const validCredentials = {
    email: 'test@example.com',
    password: 'Password123!',
    deviceId: 'test-device-123',
    rememberDevice: false
  };

  const mockMFAChallenge: MFAChallenge = {
    type: 'totp',
    expiry: new Date(Date.now() + 300000),
    attempts_remaining: 3
  };

  const mockAuthResponse: AuthResponse = {
    user: {
      id: 'test-user-id',
      email: validCredentials.email,
      role: 'USER',
      kyc_level: 1,
      mfa_enabled: true,
      last_login: new Date(),
      security_level: 2,
      session_expires: new Date(Date.now() + 3600000)
    },
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    token_expires: new Date(Date.now() + 3600000)
  };

  // Mock handlers
  const mockOnSuccess = vi.fn();
  const mockOnError = vi.fn();
  const mockOnMFARequired = vi.fn();
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup useAuth mock
    (useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      isLoading: false
    });
  });

  it('renders form elements correctly', () => {
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Verify form elements
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remember this device/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument();
  });

  it('validates form inputs correctly', async () => {
    const user = userEvent.setup();
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Submit empty form
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Check validation messages
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/password must be at least 8 characters/i)).toBeInTheDocument();

    // Enter invalid email
    await user.type(screen.getByLabelText(/email/i), 'invalid-email');
    expect(await screen.findByText(/please enter a valid email address/i)).toBeInTheDocument();

    // Enter weak password
    await user.type(screen.getByLabelText(/password/i), 'weak');
    expect(await screen.findByText(/password must contain uppercase, lowercase, number, and special character/i)).toBeInTheDocument();
  });

  it('handles successful login flow', async () => {
    mockLogin.mockResolvedValueOnce(mockAuthResponse);

    const user = userEvent.setup();
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Fill form with valid credentials
    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify login attempt
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(expect.objectContaining({
        email: validCredentials.email,
        password: validCredentials.password
      }));
    });

    // Verify success callback
    expect(mockOnSuccess).toHaveBeenCalledWith(mockAuthResponse);
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('handles MFA flow correctly', async () => {
    mockLogin.mockResolvedValueOnce({ mfaRequired: true, mfaChallenge: mockMFAChallenge });

    const user = userEvent.setup();
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Submit valid credentials
    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify MFA callback
    await waitFor(() => {
      expect(mockOnMFARequired).toHaveBeenCalledWith(mockMFAChallenge);
    });
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('handles error states correctly', async () => {
    const errorMessage = 'Invalid credentials';
    mockLogin.mockRejectedValueOnce(new Error(errorMessage));

    const user = userEvent.setup();
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Submit form
    await user.type(screen.getByLabelText(/email/i), validCredentials.email);
    await user.type(screen.getByLabelText(/password/i), validCredentials.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // Verify error handling
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(errorMessage);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('meets accessibility requirements', async () => {
    const { container } = render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();

    // Test keyboard navigation
    const form = screen.getByRole('form');
    const focusableElements = within(form).getAllByRole('textbox');
    
    // Verify tab order
    expect(document.body).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/email/i)).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText(/password/i)).toHaveFocus();
  });

  it('handles loading states correctly', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      login: mockLogin,
      isLoading: true
    });

    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    // Verify loading state
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();
    expect(submitButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(screen.getByLabelText(/password/i)).toBeDisabled();
  });

  it('toggles password visibility correctly', async () => {
    const user = userEvent.setup();
    render(
      <LoginForm
        onSuccess={mockOnSuccess}
        onError={mockOnError}
        onMFARequired={mockOnMFARequired}
      />
    );

    const passwordInput = screen.getByLabelText(/password/i);
    const toggleButton = screen.getByRole('button', { name: /show password/i });

    // Initial state
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Toggle visibility
    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(toggleButton).toHaveAccessibleName('Hide password');

    // Toggle back
    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(toggleButton).toHaveAccessibleName('Show password');
  });
});