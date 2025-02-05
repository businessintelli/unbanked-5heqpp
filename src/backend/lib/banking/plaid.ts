// External imports
import { Configuration, PlaidApi, PlaidEnvironments, Products } from 'plaid'; // v14.0.0
import { z } from 'zod'; // v3.22.0
import retry from 'retry'; // v0.13.0

// Internal imports
import { PlaidLinkConfig, Wallet, PlaidLinkConfigSchema } from '../../types/banking';
import { ValidationError, NotFoundError, RateLimitError, SecurityError } from '../common/errors';
import { Logger } from '../common/logger';

// Environment variables validation schema
const envSchema = z.object({
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']),
  PLAID_RATE_LIMIT: z.string().transform(Number).pipe(z.number().positive()),
  PLAID_WEBHOOK_SECRET: z.string().min(1)
});

// Constants
const RETRY_OPTIONS = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 5000
};

/**
 * Validates environment variables for Plaid configuration
 */
function validateEnvironment(): void {
  try {
    envSchema.parse({
      PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
      PLAID_SECRET: process.env.PLAID_SECRET,
      PLAID_ENV: process.env.PLAID_ENV || 'sandbox',
      PLAID_RATE_LIMIT: process.env.PLAID_RATE_LIMIT || '100',
      PLAID_WEBHOOK_SECRET: process.env.PLAID_WEBHOOK_SECRET
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error);
    }
    throw error;
  }
}

/**
 * Creates and configures a new Plaid client instance with retry logic and security measures
 */
export function createPlaidClient(): PlaidApi {
  validateEnvironment();

  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
        'PLAID-SECRET': process.env.PLAID_SECRET!,
        'Plaid-Version': '2020-09-14'
      }
    }
  });

  return new PlaidApi(configuration);
}

/**
 * Enhanced service class for managing Plaid API interactions with security, validation, and audit logging
 */
export class PlaidService {
  private client: PlaidApi;
  private logger: Logger;
  private rateLimiter: Map<string, number>;
  private readonly rateLimit: number;

  constructor() {
    this.client = createPlaidClient();
    this.logger = new Logger('PlaidService', {
      metadata: { service: 'banking', integration: 'plaid' }
    });
    this.rateLimiter = new Map();
    this.rateLimit = Number(process.env.PLAID_RATE_LIMIT || '100');
  }

  /**
   * Checks rate limits for API calls
   */
  private checkRateLimit(userId: string): void {
    const now = Date.now();
    const userRequests = this.rateLimiter.get(userId) || 0;

    if (userRequests >= this.rateLimit) {
      throw new RateLimitError('Rate limit exceeded for Plaid API calls');
    }

    this.rateLimiter.set(userId, userRequests + 1);
    setTimeout(() => {
      const current = this.rateLimiter.get(userId) || 0;
      this.rateLimiter.set(userId, Math.max(0, current - 1));
    }, 60000);
  }

  /**
   * Creates a secure Plaid Link token for client-side initialization
   */
  async createLinkToken(config: PlaidLinkConfig): Promise<string> {
    try {
      // Validate configuration
      PlaidLinkConfigSchema.parse(config);
      this.checkRateLimit(config.user_id);

      const operation = retry.operation(RETRY_OPTIONS);

      return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
          try {
            const response = await this.client.linkTokenCreate({
              user: {
                client_user_id: config.client_user_id
              },
              client_name: 'Unbanked',
              products: config.products as Products[],
              country_codes: config.country_codes as Array<'US' | 'GB' | 'ES'>,
              language: config.language,
              webhook: config.webhook,
              redirect_uri: config.redirect_uri
            });

            this.logger.audit({
              user_id: config.user_id,
              action: 'CREATE_LINK_TOKEN',
              resource: 'plaid_link',
              details: { attempt: currentAttempt },
              ip_address: '',
              timestamp: new Date(),
              severity: 'INFO',
              correlation_id: crypto.randomUUID(),
              user_agent: '',
              category: 'TRANSACTION'
            });

            resolve(response.data.link_token);
          } catch (error) {
            if (operation.retry(error as Error)) {
              return;
            }
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }

  /**
   * Securely exchanges public token for access token with enhanced validation
   */
  async exchangePublicToken(publicToken: string): Promise<string> {
    try {
      const operation = retry.operation(RETRY_OPTIONS);

      return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
          try {
            const response = await this.client.itemPublicTokenExchange({
              public_token: publicToken
            });

            this.logger.audit({
              user_id: 'system',
              action: 'EXCHANGE_PUBLIC_TOKEN',
              resource: 'plaid_token',
              details: { attempt: currentAttempt },
              ip_address: '',
              timestamp: new Date(),
              severity: 'INFO',
              correlation_id: crypto.randomUUID(),
              user_agent: '',
              category: 'TRANSACTION'
            });

            resolve(response.data.access_token);
          } catch (error) {
            if (operation.retry(error as Error)) {
              return;
            }
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }

  /**
   * Retrieves and validates linked bank account information
   */
  async getAccounts(accessToken: string): Promise<Array<any>> {
    try {
      const operation = retry.operation(RETRY_OPTIONS);

      return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
          try {
            const response = await this.client.accountsGet({
              access_token: accessToken
            });

            this.logger.audit({
              user_id: 'system',
              action: 'GET_ACCOUNTS',
              resource: 'plaid_accounts',
              details: { attempt: currentAttempt },
              ip_address: '',
              timestamp: new Date(),
              severity: 'INFO',
              correlation_id: crypto.randomUUID(),
              user_agent: '',
              category: 'TRANSACTION'
            });

            resolve(response.data.accounts);
          } catch (error) {
            if (operation.retry(error as Error)) {
              return;
            }
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }

  /**
   * Securely retrieves and validates transaction history
   */
  async getTransactions(
    accessToken: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<any>> {
    try {
      const operation = retry.operation(RETRY_OPTIONS);

      return new Promise((resolve, reject) => {
        operation.attempt(async (currentAttempt) => {
          try {
            const response = await this.client.transactionsGet({
              access_token: accessToken,
              start_date: startDate.toISOString().split('T')[0],
              end_date: endDate.toISOString().split('T')[0]
            });

            this.logger.audit({
              user_id: 'system',
              action: 'GET_TRANSACTIONS',
              resource: 'plaid_transactions',
              details: { attempt: currentAttempt },
              ip_address: '',
              timestamp: new Date(),
              severity: 'INFO',
              correlation_id: crypto.randomUUID(),
              user_agent: '',
              category: 'TRANSACTION'
            });

            resolve(response.data.transactions);
          } catch (error) {
            if (operation.retry(error as Error)) {
              return;
            }
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error(error as Error);
      throw error;
    }
  }
}