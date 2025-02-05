import React, { useState, useCallback, useMemo } from 'react'; // ^18.2.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.0.0
import { z } from 'zod'; // ^3.22.0
import { toast } from 'react-toastify'; // ^9.0.0
import { useProfile } from '../../hooks/useProfile';
import { useTheme } from '../../hooks/useTheme';
import Input from '../common/Input';
import Button from '../common/Button';

// Validation schema for preferences form
const preferencesSchema = z.object({
  language: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']),
  timezone: z.string().min(1),
  dateFormat: z.string().min(1),
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  theme: z.enum(['light', 'dark', 'system']),
  currency: z.enum(['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD']),
  numberFormat: z.string().min(1)
});

type PreferencesFormData = z.infer<typeof preferencesSchema>;

const Preferences: React.FC = () => {
  const { profile, updateProfile, isLoading } = useProfile();
  const { theme, setTheme, systemTheme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form with current preferences
  const defaultValues = useMemo(() => ({
    language: profile?.preferences?.language || 'en',
    timezone: profile?.preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateFormat: profile?.preferences?.dateFormat || 'MM/DD/YYYY',
    emailNotifications: profile?.preferences?.notifications?.email_enabled || false,
    pushNotifications: profile?.preferences?.notifications?.push_enabled || false,
    theme: theme as 'light' | 'dark' | 'system',
    currency: profile?.preferences?.currency || 'USD',
    numberFormat: profile?.preferences?.numberFormat || 'en-US'
  }), [profile, theme]);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset
  } = useForm<PreferencesFormData>({
    resolver: zodResolver(preferencesSchema),
    defaultValues
  });

  // Handle form submission with debouncing
  const onSubmit = useCallback(async (data: PreferencesFormData) => {
    try {
      setIsSaving(true);

      // Update theme if changed
      if (data.theme !== theme) {
        setTheme(data.theme === 'system' ? systemTheme : data.theme);
      }

      // Update profile preferences
      await updateProfile({
        preferences: {
          language: data.language,
          timezone: data.timezone,
          dateFormat: data.dateFormat,
          notifications: {
            email_enabled: data.emailNotifications,
            push_enabled: data.pushNotifications
          },
          theme: data.theme,
          currency: data.currency,
          numberFormat: data.numberFormat
        }
      });

      toast.success('Preferences updated successfully');
      reset(data);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      toast.error('Failed to update preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [updateProfile, theme, setTheme, systemTheme, reset]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6" role="status">
        <span className="sr-only">Loading preferences...</span>
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 p-6"
      aria-label="Preferences form"
    >
      {/* Display Settings */}
      <section className="space-y-4" aria-labelledby="display-settings">
        <h2 id="display-settings" className="text-lg font-medium text-primary">
          Display Settings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Input
              label="Theme"
              {...register('theme')}
              error={errors.theme?.message}
              aria-invalid={!!errors.theme}
              as="select"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </Input>
          </div>
          <div>
            <Input
              label="Language"
              {...register('language')}
              error={errors.language?.message}
              aria-invalid={!!errors.language}
              as="select"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              {/* Add other supported languages */}
            </Input>
          </div>
        </div>
      </section>

      {/* Regional Settings */}
      <section className="space-y-4" aria-labelledby="regional-settings">
        <h2 id="regional-settings" className="text-lg font-medium text-primary">
          Regional Settings
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Input
              label="Currency"
              {...register('currency')}
              error={errors.currency?.message}
              aria-invalid={!!errors.currency}
              as="select"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              {/* Add other supported currencies */}
            </Input>
          </div>
          <div>
            <Input
              label="Time Zone"
              {...register('timezone')}
              error={errors.timezone?.message}
              aria-invalid={!!errors.timezone}
              as="select"
            >
              {Intl.supportedValuesOf('timeZone').map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </Input>
          </div>
        </div>
      </section>

      {/* Notification Settings */}
      <section className="space-y-4" aria-labelledby="notification-settings">
        <h2 id="notification-settings" className="text-lg font-medium text-primary">
          Notification Settings
        </h2>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              {...register('emailNotifications')}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Email Notifications</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              {...register('pushNotifications')}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Push Notifications</span>
          </label>
        </div>
      </section>

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => reset(defaultValues)}
          disabled={!isDirty || isSaving}
        >
          Reset
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isSaving}
          disabled={!isDirty || isSaving}
        >
          Save Changes
        </Button>
      </div>
    </form>
  );
};

export default Preferences;