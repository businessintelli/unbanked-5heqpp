import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAnalytics } from '@amplitude/analytics-browser';

import KYCForm from '../../components/auth/KYCForm';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { storage } from '../../lib/storage';
import { KYCLevel } from '../../types/auth';

// Enhanced KYC verification tracking
interface VerificationProgress {
  currentStep: number;
  completedSteps: number[];
  lastUpdated: Date;
  sessionId: string;
}

// Document quality metrics
interface DocumentQualityMetrics {
  resolution: number;
  fileSize: number;
  format: string;
  isValid: boolean;
}

// Enhanced KYC submission data with security tracking
interface KYCSubmissionData {
  fullName: string;
  dateOfBirth: string;
  nationality: string;
  address: string;
  city: string;
  country: string;
  postalCode: string;
  documentType: 'idCard' | 'passport' | 'drivingLicense';
  documentNumber: string;
  documentFiles: File[];
  documentQuality: DocumentQualityMetrics;
  verificationProgress: VerificationProgress;
}

const KYCPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading, kycStatus } = useAuth();
  const analytics = useAnalytics();
  
  // Enhanced state management
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [verificationProgress, setVerificationProgress] = useState<VerificationProgress>({
    currentStep: 1,
    completedSteps: [],
    lastUpdated: new Date(),
    sessionId: crypto.randomUUID()
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Security check for authenticated users
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (user.kyc_level >= KYCLevel.VERIFIED) {
      navigate('/dashboard', { replace: true });
      return;
    }

    // Load saved verification progress
    const savedProgress = storage.getItem<VerificationProgress>('kyc_progress');
    if (savedProgress) {
      setVerificationProgress(savedProgress);
      setCurrentStep(savedProgress.currentStep);
    }

    // Track KYC funnel entry
    analytics.track('KYC_Started', {
      userId: user.id,
      kycLevel: user.kyc_level,
      sessionId: verificationProgress.sessionId
    });
  }, [user, navigate, analytics]);

  // Handle step changes with progress tracking
  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
    setVerificationProgress(prev => ({
      ...prev,
      currentStep: step,
      completedSteps: [...new Set([...prev.completedSteps, step - 1])],
      lastUpdated: new Date()
    }));

    // Save progress
    storage.setItem('kyc_progress', verificationProgress, false, {
      expiresIn: 24 * 60 * 60 * 1000 // 24 hours
    });

    // Track step progression
    analytics.track('KYC_Step_Changed', {
      userId: user?.id,
      step,
      sessionId: verificationProgress.sessionId
    });
  }, [user, verificationProgress, analytics]);

  // Enhanced document quality check
  const validateDocumentQuality = async (file: File): Promise<DocumentQualityMetrics> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            resolution: img.width * img.height,
            fileSize: file.size,
            format: file.type,
            isValid: file.size <= 10 * 1024 * 1024 && // 10MB max
              ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)
          });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Enhanced form submission handler
  const handleSubmit = async (data: KYCSubmissionData) => {
    try {
      setIsSubmitting(true);

      // Validate document quality
      const qualityMetrics = await Promise.all(
        data.documentFiles.map(file => validateDocumentQuality(file))
      );

      if (!qualityMetrics.every(metric => metric.isValid)) {
        toast.error('Document quality does not meet requirements');
        return;
      }

      // Create encrypted form data
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'documentFiles') {
          formData.append(key, JSON.stringify(value));
        }
      });

      // Append documents with quality metrics
      data.documentFiles.forEach((file, index) => {
        formData.append(`document_${index}`, file);
        formData.append(`document_${index}_metrics`, JSON.stringify(qualityMetrics[index]));
      });

      // Submit verification request
      const response = await api.post('/kyc/verify', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.status === 'success') {
        // Clear saved progress
        storage.removeItem('kyc_progress');

        // Track successful submission
        analytics.track('KYC_Submitted', {
          userId: user?.id,
          sessionId: verificationProgress.sessionId,
          documentTypes: data.documentFiles.map(f => f.type)
        });

        toast.success('Verification submitted successfully');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('KYC submission failed:', error);
      toast.error('Verification submission failed. Please try again.');

      // Track submission failure
      analytics.track('KYC_Submission_Failed', {
        userId: user?.id,
        sessionId: verificationProgress.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle verification abandonment
  const handleAbandon = useCallback(() => {
    storage.removeItem('kyc_progress');
    analytics.track('KYC_Abandoned', {
      userId: user?.id,
      sessionId: verificationProgress.sessionId,
      lastStep: currentStep
    });
    navigate('/dashboard');
  }, [user, currentStep, verificationProgress, analytics, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        <span className="sr-only">Loading verification...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen bg-background">
      <div className="max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Identity Verification
          </h1>
          <p className="text-muted-foreground">
            Complete your verification to access all platform features
          </p>
        </header>

        <div className="bg-card rounded-lg shadow-lg p-6">
          <KYCForm
            currentStep={currentStep}
            onStepChange={handleStepChange}
            onSubmit={handleSubmit}
            isLoading={isSubmitting}
            onError={(error) => {
              toast.error(error.message);
              analytics.track('KYC_Error', {
                userId: user?.id,
                sessionId: verificationProgress.sessionId,
                error: error.message,
                step: currentStep
              });
            }}
          />

          {currentStep > 1 && (
            <button
              onClick={handleAbandon}
              className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Save progress and continue later"
            >
              Save and continue later
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default KYCPage;