import React, { memo, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form'; // ^7.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^3.0.0

import Input from '../common/Input';
import Button from '../common/Button';
import { useProfile } from '../../hooks/useProfile';
import { profileSchema } from '../../lib/validation';
import { KYCLevel, ProfileStatus } from '../../types/profile';

interface PersonalInfoFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address: {
    street_address: string;
    unit_number?: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}

const PersonalInfo = memo(() => {
  // Initialize profile management hook
  const { profile, updateProfile, kycStatus, isLoading } = useProfile();

  // Initialize form with validation
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
    setError
  } = useForm<PersonalInfoFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      email: profile?.email || '',
      phone_number: profile?.phone_number || '',
      address: {
        street_address: profile?.address?.street_address || '',
        unit_number: profile?.address?.unit_number || '',
        city: profile?.address?.city || '',
        state: profile?.address?.state || '',
        postal_code: profile?.address?.postal_code || '',
        country: profile?.address?.country || ''
      }
    }
  });

  // Update form when profile data changes
  useEffect(() => {
    if (profile) {
      reset({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone_number: profile.phone_number,
        address: {
          street_address: profile.address.street_address,
          unit_number: profile.address.unit_number,
          city: profile.address.city,
          state: profile.address.state,
          postal_code: profile.address.postal_code,
          country: profile.address.country
        }
      });
    }
  }, [profile, reset]);

  // Form submission handler with optimistic updates
  const onSubmit = useCallback(async (data: PersonalInfoFormData) => {
    try {
      await updateProfile({
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone_number,
        address: data.address
      });
    } catch (error) {
      setError('root', {
        type: 'submit',
        message: 'Failed to update profile. Please try again.'
      });
    }
  }, [updateProfile, setError]);

  // Render KYC status badge
  const renderKYCStatus = useCallback(() => {
    if (!kycStatus) return null;

    const statusConfig = {
      [KYCLevel.NONE]: {
        label: 'Unverified',
        className: 'bg-red-100 text-red-800'
      },
      [KYCLevel.BASIC]: {
        label: 'Basic',
        className: 'bg-yellow-100 text-yellow-800'
      },
      [KYCLevel.VERIFIED]: {
        label: 'Verified',
        className: 'bg-green-100 text-green-800'
      },
      [KYCLevel.ENHANCED]: {
        label: 'Enhanced',
        className: 'bg-blue-100 text-blue-800'
      }
    };

    const config = statusConfig[kycStatus.level];

    return (
      <div 
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
        role="status"
        aria-label={`KYC Status: ${config.label}`}
      >
        {config.label}
      </div>
    );
  }, [kycStatus]);

  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center p-8" 
        role="alert" 
        aria-busy="true"
      >
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <form 
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      aria-label="Personal Information Form"
      noValidate
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Personal Information
        </h2>
        {renderKYCStatus()}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Input
          label="First Name"
          {...register('first_name')}
          error={errors.first_name?.message}
          required
          aria-required="true"
        />

        <Input
          label="Last Name"
          {...register('last_name')}
          error={errors.last_name?.message}
          required
          aria-required="true"
        />

        <Input
          label="Email"
          type="email"
          {...register('email')}
          error={errors.email?.message}
          required
          aria-required="true"
          disabled
        />

        <Input
          label="Phone Number"
          {...register('phone_number')}
          error={errors.phone_number?.message}
          required
          aria-required="true"
          placeholder="+1234567890"
        />
      </div>

      <fieldset className="space-y-6">
        <legend className="text-lg font-medium text-gray-900">Address</legend>

        <Input
          label="Street Address"
          {...register('address.street_address')}
          error={errors.address?.street_address?.message}
          required
          aria-required="true"
        />

        <Input
          label="Unit Number"
          {...register('address.unit_number')}
          error={errors.address?.unit_number?.message}
        />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Input
            label="City"
            {...register('address.city')}
            error={errors.address?.city?.message}
            required
            aria-required="true"
          />

          <Input
            label="State"
            {...register('address.state')}
            error={errors.address?.state?.message}
            required
            aria-required="true"
          />

          <Input
            label="Postal Code"
            {...register('address.postal_code')}
            error={errors.address?.postal_code?.message}
            required
            aria-required="true"
          />

          <Input
            label="Country"
            {...register('address.country')}
            error={errors.address?.country?.message}
            required
            aria-required="true"
          />
        </div>
      </fieldset>

      {errors.root && (
        <div 
          className="p-4 rounded bg-red-50 text-red-700" 
          role="alert"
        >
          {errors.root.message}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          isLoading={isSubmitting}
          aria-disabled={!isDirty || isSubmitting}
        >
          Save Changes
        </Button>
      </div>
    </form>
  );
});

PersonalInfo.displayName = 'PersonalInfo';

export default PersonalInfo;