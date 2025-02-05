import React, { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { useForm } from 'react-hook-form'; // v7.0.0
import { toast } from 'react-hot-toast'; // v2.0.0
import * as yup from 'yup'; // v1.0.0

import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { Button } from '../common/Button';
import { SecurityValidation } from '../../utils/validation';

// Constants for rate limiting and security
const MFA_SETUP_TIMEOUT = 300000; // 5 minutes
const PASSWORD_HISTORY_LENGTH = 5;
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION = 900000; // 15 minutes

interface SecuritySettingsProps {
  onSettingsChange: (settings: SecuritySettings) => void;
}

interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface MFASetupForm {
  verificationCode: string;
  backupCodes: string[];
}

interface SecurityPreferences {
  loginNotifications: boolean;
  securityAlerts: boolean;
  sessionTimeout: number;
}

/**
 * SecuritySettings component for managing user security preferences
 * with comprehensive security features and accessibility support
 */
const SecuritySettings: React.FC<SecuritySettingsProps> = ({ onSettingsChange }) => {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);

  // Hooks
  const { user, verifyMFA, updateSecuritySettings } = useAuth();
  const { profile, updateProfile } = useProfile();

  // Form handling
  const passwordForm = useForm<PasswordChangeForm>({
    resolver: yup.object().shape(SecurityValidation.passwordSchema)
  });

  const mfaForm = useForm<MFASetupForm>();

  const preferencesForm = useForm<SecurityPreferences>({
    defaultValues: {
      loginNotifications: true,
      securityAlerts: true,
      sessionTimeout: 30
    }
  });

  // Initialize security settings
  useEffect(() => {
    if (profile) {
      setMfaEnabled(profile.preferences.two_factor_enabled);
      preferencesForm.reset({
        loginNotifications: profile.preferences.notifications.login_alerts,
        securityAlerts: profile.preferences.notifications.security_alerts,
        sessionTimeout: profile.preferences.session_timeout || 30
      });
    }
  }, [profile]);

  /**
   * Handle password change with security checks and rate limiting
   */
  const handlePasswordChange = useCallback(async (data: PasswordChangeForm) => {
    if (lockoutUntil && new Date() < lockoutUntil) {
      toast.error(`Account locked. Try again in ${Math.ceil((lockoutUntil.getTime() - Date.now()) / 60000)} minutes`);
      return;
    }

    try {
      setIsLoading(true);

      // Validate password history
      const passwordHistory = await updateSecuritySettings({
        type: 'validate_password_history',
        password: data.newPassword
      });

      if (!passwordHistory.valid) {
        toast.error('Password was used recently. Choose a different password.');
        return;
      }

      // Update password
      await updateSecuritySettings({
        type: 'change_password',
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      });

      // Reset failed attempts on success
      setFailedAttempts(0);
      setLockoutUntil(null);
      
      toast.success('Password updated successfully');
      passwordForm.reset();

    } catch (error) {
      // Handle failed attempts and lockout
      const newFailedAttempts = failedAttempts + 1;
      setFailedAttempts(newFailedAttempts);

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockoutTime = new Date(Date.now() + LOCKOUT_DURATION);
        setLockoutUntil(lockoutTime);
        toast.error(`Account locked until ${lockoutTime.toLocaleTimeString()}`);
      } else {
        toast.error('Invalid current password');
      }
    } finally {
      setIsLoading(false);
    }
  }, [failedAttempts, lockoutUntil]);

  /**
   * Handle MFA setup with QR code generation and backup codes
   */
  const handleMFAToggle = useCallback(async (data?: MFASetupForm) => {
    try {
      setIsLoading(true);

      if (!mfaEnabled) {
        // Generate MFA setup
        const setupResponse = await updateSecuritySettings({
          type: 'setup_mfa'
        });

        setShowQRCode(true);
        mfaForm.setValue('backupCodes', setupResponse.backupCodes);

      } else if (data) {
        // Verify and disable MFA
        const verified = await verifyMFA(data.verificationCode, 'totp');
        
        if (!verified) {
          toast.error('Invalid verification code');
          return;
        }

        await updateSecuritySettings({
          type: 'disable_mfa'
        });

        setMfaEnabled(false);
        setShowQRCode(false);
        toast.success('Two-factor authentication disabled');
      }
    } catch (error) {
      toast.error('Failed to update MFA settings');
    } finally {
      setIsLoading(false);
    }
  }, [mfaEnabled]);

  /**
   * Handle security preferences update
   */
  const handlePreferencesUpdate = useCallback(async (data: SecurityPreferences) => {
    try {
      setIsLoading(true);

      await updateProfile({
        preferences: {
          notifications: {
            login_alerts: data.loginNotifications,
            security_alerts: data.securityAlerts
          },
          session_timeout: data.sessionTimeout
        }
      });

      onSettingsChange(data);
      toast.success('Security preferences updated');

    } catch (error) {
      toast.error('Failed to update preferences');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="space-y-8" role="region" aria-label="Security Settings">
      {/* Password Change Section */}
      <section aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-xl font-semibold mb-4">
          Change Password
        </h2>
        <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)}>
          <div className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium">
                Current Password
              </label>
              <input
                id="currentPassword"
                type="password"
                {...passwordForm.register('currentPassword')}
                className="mt-1 block w-full rounded-md border-gray-300"
                aria-invalid={!!passwordForm.formState.errors.currentPassword}
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                {...passwordForm.register('newPassword')}
                className="mt-1 block w-full rounded-md border-gray-300"
                aria-invalid={!!passwordForm.formState.errors.newPassword}
                disabled={isLoading}
              />
            </div>
            <Button
              type="submit"
              isLoading={isLoading}
              disabled={isLoading || !!lockoutUntil}
              fullWidth
            >
              Update Password
            </Button>
          </div>
        </form>
      </section>

      {/* MFA Section */}
      <section aria-labelledby="mfa-heading">
        <h2 id="mfa-heading" className="text-xl font-semibold mb-4">
          Two-Factor Authentication
        </h2>
        {!mfaEnabled ? (
          <div>
            <p className="mb-4">Enhance your account security with two-factor authentication</p>
            <Button
              onClick={() => handleMFAToggle()}
              isLoading={isLoading}
              variant="primary"
            >
              Enable 2FA
            </Button>
          </div>
        ) : (
          <form onSubmit={mfaForm.handleSubmit(handleMFAToggle)}>
            {showQRCode && (
              <div className="mb-4">
                <p className="text-sm mb-2">Scan this QR code with your authenticator app</p>
                <div
                  className="qr-code-container"
                  role="img"
                  aria-label="QR Code for two-factor authentication setup"
                />
                <div className="mt-4">
                  <p className="text-sm font-medium">Backup Codes</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {mfaForm.watch('backupCodes')?.map((code, index) => (
                      <code key={index} className="text-sm bg-gray-100 p-1 rounded">
                        {code}
                      </code>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="verificationCode" className="block text-sm font-medium">
                  Verification Code
                </label>
                <input
                  id="verificationCode"
                  type="text"
                  inputMode="numeric"
                  {...mfaForm.register('verificationCode')}
                  className="mt-1 block w-full rounded-md border-gray-300"
                  aria-invalid={!!mfaForm.formState.errors.verificationCode}
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                isLoading={isLoading}
                variant="destructive"
              >
                Disable 2FA
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Security Preferences Section */}
      <section aria-labelledby="preferences-heading">
        <h2 id="preferences-heading" className="text-xl font-semibold mb-4">
          Security Preferences
        </h2>
        <form onSubmit={preferencesForm.handleSubmit(handlePreferencesUpdate)}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="loginNotifications" className="text-sm font-medium">
                Login Notifications
              </label>
              <input
                id="loginNotifications"
                type="checkbox"
                {...preferencesForm.register('loginNotifications')}
                className="rounded border-gray-300"
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <label htmlFor="securityAlerts" className="text-sm font-medium">
                Security Alerts
              </label>
              <input
                id="securityAlerts"
                type="checkbox"
                {...preferencesForm.register('securityAlerts')}
                className="rounded border-gray-300"
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="sessionTimeout" className="block text-sm font-medium">
                Session Timeout (minutes)
              </label>
              <select
                id="sessionTimeout"
                {...preferencesForm.register('sessionTimeout')}
                className="mt-1 block w-full rounded-md border-gray-300"
                disabled={isLoading}
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>
            <Button
              type="submit"
              isLoading={isLoading}
              fullWidth
            >
              Save Preferences
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default SecuritySettings;