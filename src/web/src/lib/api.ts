import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'; // v1.6.0
import axiosRetry from 'axios-retry'; // v3.8.0
import { z } from 'zod'; // v3.22.0
import detect from 'browser-detect'; // v1.0.0

import { API_CONFIG, ENDPOINTS, RETRY_CONFIG } from '../config/api';
import { ApiResponse, ApiError, apiResponseSchema, ApiErrorCode } from '../types/api';
import { storage } from './storage';

/**
 * Performance monitoring interface for API requests
 */
interface PerformanceMetrics {
  requestStart: number;
  responseTime: number;
  endpoint: string;
  success: boolean;
}

/**
 * Request queue for rate limiting and prioritization
 */
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await request();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        await request();
        await new Promise(resolve => setTimeout(resolve, 50)); // Rate limiting delay
      }
    }
    
    this.processing = false;
  }
}

/**
 * Enhanced API client with comprehensive features
 */
class ApiClient {
  private instance: AxiosInstance;
  private queue: RequestQueue;
  private metrics: PerformanceMetrics[] = [];
  private browser = detect();

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_CONFIG.baseUrl}/api/${API_CONFIG.version}`,
      timeout: API_CONFIG.timeout,
      headers: API_CONFIG.headers
    });

    this.queue = new RequestQueue();
    this.setupInterceptors();
    this.setupRetry();
  }

  /**
   * Configures request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptors
    this.instance.interceptors.request.use(
      async (config) => {
        // Add auth token if available
        const token = await storage.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add browser compatibility headers
        config.headers['X-Browser-Name'] = this.browser.name;
        config.headers['X-Browser-Version'] = this.browser.version;

        // Add request ID for tracking
        config.headers['X-Request-ID'] = crypto.randomUUID();

        // Start performance monitoring
        const metrics: PerformanceMetrics = {
          requestStart: performance.now(),
          responseTime: 0,
          endpoint: config.url || '',
          success: false
        };
        this.metrics.push(metrics);

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptors
    this.instance.interceptors.response.use(
      (response) => {
        // Update performance metrics
        const metrics = this.metrics.find(m => 
          m.endpoint === response.config.url
        );
        if (metrics) {
          metrics.responseTime = performance.now() - metrics.requestStart;
          metrics.success = true;
        }

        // Validate response schema
        try {
          const schema = apiResponseSchema(z.any());
          schema.parse(response.data);
        } catch (error) {
          throw new Error('Invalid API response format');
        }

        return response;
      },
      async (error: AxiosError) => {
        const apiError = await this.handleApiError(error);
        return Promise.reject(apiError);
      }
    );
  }

  /**
   * Configures retry behavior with exponential backoff
   */
  private setupRetry(): void {
    axiosRetry(this.instance, {
      retries: RETRY_CONFIG.maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) => {
        return RETRY_CONFIG.retryCondition(error);
      }
    });
  }

  /**
   * Processes API errors with comprehensive error recovery
   */
  private async handleApiError(error: AxiosError): Promise<ApiError> {
    const apiError: ApiError = {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: {},
      timestamp: new Date(),
      path: error.config?.url || ''
    };

    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          apiError.code = ApiErrorCode.UNAUTHORIZED;
          apiError.message = 'Authentication required';
          break;
        case 403:
          apiError.code = ApiErrorCode.FORBIDDEN;
          apiError.message = 'Access denied';
          break;
        case 404:
          apiError.code = ApiErrorCode.NOT_FOUND;
          apiError.message = 'Resource not found';
          break;
        case 429:
          apiError.code = ApiErrorCode.RATE_LIMITED;
          apiError.message = 'Too many requests';
          break;
        default:
          apiError.code = ApiErrorCode.INTERNAL_ERROR;
          apiError.message = data?.message || 'Server error';
      }
    } else if (error.request) {
      apiError.code = ApiErrorCode.SERVICE_UNAVAILABLE;
      apiError.message = 'Network error';
    }

    return apiError;
  }

  /**
   * Makes type-safe API request with comprehensive validation
   */
  async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.queue.add(async () => {
      try {
        const response = await this.instance.request(config);
        return response.data as ApiResponse<T>;
      } catch (error) {
        throw await this.handleApiError(error as AxiosError);
      }
    });
  }

  /**
   * Typed GET request wrapper
   */
  async get<T>(url: string, config?: Omit<AxiosRequestConfig, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * Typed POST request wrapper
   */
  async post<T>(url: string, data?: any, config?: Omit<AxiosRequestConfig, 'method' | 'data'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'POST', url, data });
  }

  /**
   * Typed PUT request wrapper
   */
  async put<T>(url: string, data?: any, config?: Omit<AxiosRequestConfig, 'method' | 'data'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'PUT', url, data });
  }

  /**
   * Typed DELETE request wrapper
   */
  async delete<T>(url: string, config?: Omit<AxiosRequestConfig, 'method'>): Promise<ApiResponse<T>> {
    return this.request<T>({ ...config, method: 'DELETE', url });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for custom instances
export { ApiClient };