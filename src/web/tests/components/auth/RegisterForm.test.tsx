import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'; // ^14.0.0
import userEvent from '@testing-library/user-event'; // ^14.0.0
import { vi, describe, it, expect, beforeEach } from 'vitest'; // ^0.34.0
import { axe, toHaveNoViolations } from 'jest-axe'; // ^4.7.0
import RegisterForm from '../../../src/components/auth/RegisterForm';
import { useAuth } from '../../../src/hooks/useAuth';

// Mock the useAuth hook
vi.mock('../../../src/hooks/useAuth', () => ({
  useAuth: vi.fn()
}));

// Mock crypto.subtle for device fingerprinting
const mockSubtle = {
  digest: vi.fn().mockResolvedValue(new ArrayBuffer(32))
};

Object.defineProperty(window, 'crypto', {
  value: { subtle: mockSubtle }
});

// Test data
const validFormData = {
  email: 'test@example.com',
  password: 'StrongP@ss123!',
  confirmPassword: 'StrongP@ss123!',
  acceptTerms: true
};

const mockDeviceFingerprint = 'mock-device-fingerprint-123';

describe('RegisterForm', () => {
  // Set up enhanced test environment
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock useAuth implementation with security features
    const mockRegister = vi.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({
      register: mockRegister,
      isLoading: false,
      error: null
    });

    // Reset crypto mock
    mockSubtle.digest.mockClear();
  });

  // Security Features Test Suite
  describe('Security Features', () => {
    it('generates and includes device fingerprint', async () => {
      render(<RegisterForm />);
      
      // Submit form with valid data
      await userEvent.type(screen.getByLabelText(/email/i), validFormData.email);
      await userEvent.type(screen.getByLabelText(/password/i), validFormData.password);
      await userEvent.type(screen.getByLabelText(/confirm password/i), validFormData.confirmPassword);
      await userEvent.click(screen.getByLabelText(/terms/i));
      
      await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      
      // Verify device fingerprint generation
      expect(mockSubtle.digest).toHaveBeenCalled();
    });

    it('implements rate limiting for form submission', async () => {
      render(<RegisterForm />);
      
      // Attempt multiple rapid submissions
      for (let i = 0; i < 3; i++) {
        await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      }
      
      // Verify rate limit message
      expect(await screen.findByText(/please wait/i)).toBeInTheDocument();
    });

    it('validates password strength requirements', async () => {
      render(<RegisterForm />);
      
      // Test weak password
      await userEvent.type(screen.getByLabelText(/password/i), 'weak');
      
      // Verify password requirements message
      expect(await screen.findByText(/password must contain/i)).toBeInTheDocument();
    });
  });

  // Accessibility Compliance Test Suite
  describe('Accessibility Compliance', () => {
    it('meets WCAG 2.1 accessibility standards', async () => {
      const { container } = render(<RegisterForm />);
      
      // Run axe accessibility tests
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports keyboard navigation', async () => {
      render(<RegisterForm />);
      
      // Test tab navigation
      await userEvent.tab();
      expect(screen.getByLabelText(/email/i)).toHaveFocus();
      
      await userEvent.tab();
      expect(screen.getByLabelText(/password/i)).toHaveFocus();
      
      await userEvent.tab();
      expect(screen.getByLabelText(/confirm password/i)).toHaveFocus();
    });

    it('provides appropriate ARIA labels and roles', () => {
      render(<RegisterForm />);
      
      // Verify ARIA attributes
      expect(screen.getByRole('form')).toHaveAttribute('aria-label', 'Registration form');
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'false');
    });
  });

  // Form Validation Test Suite
  describe('Form Validation', () => {
    it('validates email format', async () => {
      render(<RegisterForm />);
      
      // Test invalid email
      await userEvent.type(screen.getByLabelText(/email/i), 'invalid-email');
      await userEvent.tab();
      
      expect(await screen.findByText(/invalid email/i)).toBeInTheDocument();
    });

    it('ensures passwords match', async () => {
      render(<RegisterForm />);
      
      // Test mismatched passwords
      await userEvent.type(screen.getByLabelText(/password/i), 'StrongP@ss123!');
      await userEvent.type(screen.getByLabelText(/confirm password/i), 'DifferentP@ss123!');
      
      await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      
      expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    });

    it('requires terms acceptance', async () => {
      render(<RegisterForm />);
      
      // Submit without accepting terms
      await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      
      expect(await screen.findByText(/must accept the terms/i)).toBeInTheDocument();
    });
  });

  // Integration Testing Suite
  describe('Integration Testing', () => {
    it('successfully submits registration with valid data', async () => {
      const mockRegister = vi.fn().mockResolvedValue(undefined);
      (useAuth as jest.Mock).mockReturnValue({
        register: mockRegister,
        isLoading: false,
        error: null
      });

      render(<RegisterForm />);
      
      // Fill and submit form
      await userEvent.type(screen.getByLabelText(/email/i), validFormData.email);
      await userEvent.type(screen.getByLabelText(/password/i), validFormData.password);
      await userEvent.type(screen.getByLabelText(/confirm password/i), validFormData.confirmPassword);
      await userEvent.click(screen.getByLabelText(/terms/i));
      
      await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      
      // Verify registration call
      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          email: validFormData.email,
          password: validFormData.password,
          deviceFingerprint: expect.any(String)
        });
      });
    });

    it('handles registration errors appropriately', async () => {
      const mockError = 'Registration failed due to server error';
      (useAuth as jest.Mock).mockReturnValue({
        register: vi.fn().mockRejectedValue(new Error(mockError)),
        isLoading: false,
        error: mockError
      });

      render(<RegisterForm />);
      
      // Submit form
      await userEvent.click(screen.getByRole('button', { name: /create account/i }));
      
      // Verify error display
      expect(await screen.findByText(mockError)).toBeInTheDocument();
    });

    it('disables form during submission', async () => {
      (useAuth as jest.Mock).mockReturnValue({
        register: vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000))),
        isLoading: true,
        error: null
      });

      render(<RegisterForm />);
      
      const submitButton = screen.getByRole('button', { name: /create account/i });
      await userEvent.click(submitButton);
      
      expect(submitButton).toBeDisabled();
      expect(submitButton).toHaveAttribute('aria-disabled', 'true');
    });
  });
});