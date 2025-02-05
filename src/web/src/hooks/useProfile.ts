import { useState } from 'react'; // v18.2.0
import { useQuery, useMutation } from '@tanstack/react-query'; // v4.0.0
import { Profile, ProfileStatus, KYCLevel } from '../types/profile';
import { apiClient } from '../lib/api';
import { profileSchema } from '../lib/validation';

// Query key for profile data caching
const PROFILE_QUERY_KEY = ['profile'] as const;
const PROFILE_CACHE_TIME = 5 * 60 * 1000; // 5 minutes
const PROFILE_STALE_TIME = 30 * 1000; // 30 seconds
const PROFILE_RETRY_COUNT = 3;
const PROFILE_RETRY_DELAY = 1000; // 1 second

/**
 * Custom hook for managing user profile with real-time updates and KYC tracking
 */
export const useProfile = () => {
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);

  /**
   * Fetches user profile data with validation and error handling
   */
  const fetchProfile = async (): Promise<Profile> => {
    try {
      const response = await apiClient.get<Profile>('/profile/get-profile');
      const validatedProfile = profileSchema.parse(response.data);
      return validatedProfile;
    } catch (error) {
      console.error('Profile fetch failed:', error);
      throw error;
    }
  };

  /**
   * Query hook for profile data with caching and real-time updates
   */
  const {
    data: profile,
    isLoading,
    error,
    refetch: refetchProfile
  } = useQuery(
    PROFILE_QUERY_KEY,
    fetchProfile,
    {
      cacheTime: PROFILE_CACHE_TIME,
      staleTime: PROFILE_STALE_TIME,
      retry: PROFILE_RETRY_COUNT,
      retryDelay: PROFILE_RETRY_DELAY,
      onError: (error) => {
        console.error('Profile query error:', error);
        setIsRealTimeEnabled(false);
      }
    }
  );

  /**
   * Mutation hook for profile updates with optimistic updates
   */
  const { mutate: updateProfile } = useMutation(
    async (updateData: Partial<Profile>) => {
      const sanitizedData = profileSchema.partial().parse(updateData);
      const response = await apiClient.put<Profile>(
        '/profile/update-profile',
        sanitizedData
      );
      return profileSchema.parse(response.data);
    },
    {
      onMutate: async (newData) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries(PROFILE_QUERY_KEY);

        // Snapshot the previous value
        const previousProfile = queryClient.getQueryData<Profile>(PROFILE_QUERY_KEY);

        // Optimistically update to the new value
        if (previousProfile) {
          queryClient.setQueryData<Profile>(PROFILE_QUERY_KEY, {
            ...previousProfile,
            ...newData
          });
        }

        return { previousProfile };
      },
      onError: (error, newData, context) => {
        // Rollback on error
        if (context?.previousProfile) {
          queryClient.setQueryData(PROFILE_QUERY_KEY, context.previousProfile);
        }
        console.error('Profile update failed:', error);
      },
      onSettled: () => {
        // Always refetch after error or success
        queryClient.invalidateQueries(PROFILE_QUERY_KEY);
      }
    }
  );

  /**
   * Set up real-time subscription for profile updates
   */
  useEffect(() => {
    if (!isRealTimeEnabled) return;

    const subscription = apiClient.subscribe<Profile>(
      'profile_updates',
      (updatedProfile) => {
        try {
          const validatedProfile = profileSchema.parse(updatedProfile);
          queryClient.setQueryData(PROFILE_QUERY_KEY, validatedProfile);
        } catch (error) {
          console.error('Invalid profile update received:', error);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [isRealTimeEnabled]);

  /**
   * Calculate KYC status based on profile data
   */
  const kycStatus = useMemo(() => {
    if (!profile) return null;

    return {
      level: profile.kyc_level,
      isVerified: profile.kyc_level >= KYCLevel.VERIFIED,
      isPending: profile.status === ProfileStatus.PENDING_VERIFICATION,
      lastVerified: profile.kyc_verified_at,
      canUpgrade: profile.kyc_level < KYCLevel.ENHANCED
    };
  }, [profile]);

  return {
    profile,
    isLoading,
    error,
    updateProfile,
    refetchProfile,
    kycStatus,
    isRealTimeEnabled
  };
};

// Export types for consumers
export type UseProfileReturn = ReturnType<typeof useProfile>;