import React from 'react'; // ^18.2.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import { zodResolver } from '@hookform/resolvers/zod'; // ^4.0.0
import { z } from 'zod'; // ^3.0.0
import { Upload, AlertCircle, CheckCircle2, Camera } from 'lucide-react'; // ^0.294.0

import Button, { buttonVariants } from '../common/Button';
import Input from '../common/Input';
import { useAuth } from '../../hooks/useAuth';

// Enhanced KYC validation schema with strict requirements
const kycFormSchema = z.object({
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must not exceed 100 characters')
    .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens and apostrophes'),
  
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .refine(date => {
      const dob = new Date(date);
      const now = new Date();
      const age = now.getFullYear() - dob.getFullYear();
      return age >= 18 && age <= 120;
    }, 'You must be at least 18 years old'),
  
  nationality: z.string()
    .min(2, 'Please select your nationality'),
  
  address: z.string()
    .min(5, 'Address must be at least 5 characters')
    .max(200, 'Address must not exceed 200 characters'),
  
  city: z.string()
    .min(2, 'City must be at least 2 characters')
    .max(100, 'City must not exceed 100 characters'),
  
  country: z.string()
    .min(2, 'Please select your country'),
  
  postalCode: z.string()
    .regex(/^[A-Z0-9\s-]{2,10}$/i, 'Invalid postal code format'),
  
  documentType: z.enum(['idCard', 'passport', 'drivingLicense', 'residencePermit'], {
    required_error: 'Please select a document type'
  }),
  
  documentNumber: z.string()
    .min(3, 'Document number must be at least 3 characters')
    .max(50, 'Document number must not exceed 50 characters')
    .regex(/^[A-Z0-9-]+$/i, 'Invalid document number format'),
  
  documentExpiryDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
    .refine(date => new Date(date) > new Date(), 'Document must not be expired'),
  
  documentIssuingCountry: z.string()
    .min(2, 'Please select issuing country'),
  
  verificationMethod: z.enum(['standard', 'enhanced'], {
    required_error: 'Please select verification method'
  }),
  
  consentToDataProcessing: z.boolean()
    .refine(val => val === true, 'You must consent to data processing')
});

type KYCFormData = z.infer<typeof kycFormSchema>;

interface KYCFormProps {
  onSubmit: (data: KYCFormData) => Promise<void>;
  onError: (error: Error) => void;
  isLoading: boolean;
  currentStep: number;
  onStepChange: (step: number) => void;
}

const KYCForm: React.FC<KYCFormProps> = ({
  onSubmit,
  onError,
  isLoading,
  currentStep,
  onStepChange
}) => {
  const { user, kycStatus } = useAuth();
  const [uploadProgress, setUploadProgress] = React.useState<number>(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    trigger
  } = useForm<KYCFormData>({
    resolver: zodResolver(kycFormSchema),
    mode: 'onChange'
  });

  const handleFileUpload = async (file: File): Promise<string> => {
    try {
      // Validate file type and size
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
        throw new Error('Invalid file type. Please upload JPEG, PNG or PDF');
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must not exceed 10MB');
      }

      const formData = new FormData();
      formData.append('document', file);
      formData.append('userId', user?.id || '');
      formData.append('documentType', watch('documentType'));

      const response = await fetch('/api/kyc/upload-document', {
        method: 'POST',
        body: formData,
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (!response.ok) {
        throw new Error('Document upload failed');
      }

      const { url } = await response.json();
      return url;
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Upload failed'));
      return '';
    }
  };

  const renderStep = (step: number) => {
    switch (step) {
      case 1:
        return (
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold mb-4">Personal Information</legend>
            <Input
              label="Full Name"
              {...register('fullName')}
              error={errors.fullName?.message}
              required
              aria-required="true"
            />
            <Input
              label="Date of Birth"
              type="date"
              {...register('dateOfBirth')}
              error={errors.dateOfBirth?.message}
              required
              aria-required="true"
            />
            <Input
              label="Nationality"
              {...register('nationality')}
              error={errors.nationality?.message}
              required
              aria-required="true"
            />
          </fieldset>
        );

      case 2:
        return (
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold mb-4">Address Information</legend>
            <Input
              label="Address"
              {...register('address')}
              error={errors.address?.message}
              required
              aria-required="true"
            />
            <Input
              label="City"
              {...register('city')}
              error={errors.city?.message}
              required
              aria-required="true"
            />
            <Input
              label="Country"
              {...register('country')}
              error={errors.country?.message}
              required
              aria-required="true"
            />
            <Input
              label="Postal Code"
              {...register('postalCode')}
              error={errors.postalCode?.message}
              required
              aria-required="true"
            />
          </fieldset>
        );

      case 3:
        return (
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold mb-4">Document Verification</legend>
            <select
              {...register('documentType')}
              className={buttonVariants({ variant: 'outline', className: 'w-full' })}
              aria-invalid={!!errors.documentType}
            >
              <option value="">Select Document Type</option>
              <option value="passport">Passport</option>
              <option value="idCard">ID Card</option>
              <option value="drivingLicense">Driving License</option>
              <option value="residencePermit">Residence Permit</option>
            </select>
            {errors.documentType && (
              <p className="text-sm text-error" role="alert">{errors.documentType.message}</p>
            )}
            
            <Input
              label="Document Number"
              {...register('documentNumber')}
              error={errors.documentNumber?.message}
              required
              aria-required="true"
            />
            
            <Input
              label="Document Expiry Date"
              type="date"
              {...register('documentExpiryDate')}
              error={errors.documentExpiryDate?.message}
              required
              aria-required="true"
            />

            <div className="mt-4">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await handleFileUpload(file);
                    if (url) {
                      setValue('documentType', watch('documentType'), { shouldValidate: true });
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                startIcon={<Upload className="w-4 h-4" />}
              >
                Upload Document
              </Button>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="mt-2">
                  <div className="h-2 bg-primary-100 rounded-full">
                    <div
                      className="h-full bg-primary-600 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                      role="progressbar"
                      aria-valuenow={uploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        );

      case 4:
        return (
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold mb-4">Verification Method</legend>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  {...register('verificationMethod')}
                  value="standard"
                  className="form-radio"
                />
                <span>Standard Verification (2-3 business days)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  {...register('verificationMethod')}
                  value="enhanced"
                  className="form-radio"
                />
                <span>Enhanced Verification (24 hours, additional fee applies)</span>
              </label>
            </div>
            {errors.verificationMethod && (
              <p className="text-sm text-error" role="alert">{errors.verificationMethod.message}</p>
            )}
            
            <div className="mt-6">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('consentToDataProcessing')}
                  className="form-checkbox"
                />
                <span className="text-sm">
                  I consent to the processing of my personal data for KYC verification purposes
                </span>
              </label>
              {errors.consentToDataProcessing && (
                <p className="text-sm text-error" role="alert">{errors.consentToDataProcessing.message}</p>
              )}
            </div>
          </fieldset>
        );

      default:
        return null;
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 max-w-md mx-auto"
      noValidate
    >
      <div className="mb-8">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-600 transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
            role="progressbar"
            aria-valuenow={(currentStep / 4) * 100}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">Step {currentStep} of 4</p>
      </div>

      {renderStep(currentStep)}

      <div className="flex justify-between mt-8">
        {currentStep > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onStepChange(currentStep - 1)}
          >
            Previous
          </Button>
        )}
        
        {currentStep < 4 ? (
          <Button
            type="button"
            onClick={async () => {
              const isStepValid = await trigger();
              if (isStepValid) {
                onStepChange(currentStep + 1);
              }
            }}
          >
            Next
          </Button>
        ) : (
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={!isValid || isLoading}
          >
            Submit Verification
          </Button>
        )}
      </div>
    </form>
  );
};

export default KYCForm;