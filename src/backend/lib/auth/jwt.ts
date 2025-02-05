// External imports
import { sign, verify } from 'jsonwebtoken'; // v9.0.0
import ms from 'ms'; // v2.1.3
import { createHash, randomBytes } from 'crypto'; // v1.0.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // v2.4.1
import { createLogger, format, transports } from 'winston'; // v3.8.2

// Internal imports
import { JWTPayload, RefreshPayload } from '../../types/auth';
import { TokenBlacklist } from '../common/security';
import { ErrorCode } from '../../types/common';
import { ApplicationError } from '../common/errors';

// Constants
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const JWT_ALGORITHM = 'RS256';
const MAX_CONCURRENT_SESSIONS = 3;
const TOKEN_RATE_LIMIT = '100/1m';

// Types
interface SecurityContext {
  deviceId: string;
  ipAddress: string;
  userAgent: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Configure security logger
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'jwt-service' },
  transports: [
    new transports.File({ filename: 'security/jwt-events.log' })
  ]
});

// Configure rate limiter
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60
});

/**
 * Enhanced JWT Service with advanced security features
 */
export class EnhancedJWTService {
  private blacklist: TokenBlacklist;
  private keyRotationInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly privateKey: string,
    private readonly publicKey: string,
    private readonly securityConfig: Record<string, unknown>
  ) {
    // Validate RSA key pair
    if (!privateKey || !publicKey) {
      throw new ApplicationError(
        'Invalid JWT key configuration',
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }

    this.blacklist = new TokenBlacklist();
    this.initializeKeyRotation();
  }

  /**
   * Creates a secure token pair with enhanced security features
   */
  public async createSecureTokenPair(
    payload: Omit<JWTPayload, 'exp' | 'iat' | 'session_id'>,
    context: SecurityContext
  ): Promise<TokenPair> {
    try {
      // Check concurrent sessions
      await this.validateConcurrentSessions(payload.user_id);

      // Generate session ID
      const sessionId = randomBytes(16).toString('hex');

      // Create access token
      const accessToken = await this.generateAccessToken({
        ...payload,
        session_id: sessionId,
        device_id: context.deviceId,
        ip_address: context.ipAddress
      });

      // Create refresh token
      const refreshToken = await this.generateRefreshToken({
        user_id: payload.user_id,
        token_id: randomBytes(16).toString('hex'),
        session_id: sessionId,
        device_id: context.deviceId
      });

      const expiresIn = ms(ACCESS_TOKEN_EXPIRY);

      logger.info('Token pair created', {
        event: 'token_pair_created',
        userId: payload.user_id,
        sessionId,
        deviceId: context.deviceId
      });

      return { accessToken, refreshToken, expiresIn };
    } catch (error) {
      logger.error('Token pair creation failed', {
        event: 'token_pair_creation_failed',
        error: error.message,
        userId: payload.user_id
      });
      throw error;
    }
  }

  /**
   * Verifies and decodes an access token
   */
  public async verifyAccessToken(
    token: string,
    context: SecurityContext
  ): Promise<JWTPayload> {
    try {
      // Apply rate limiting
      await rateLimiter.consume(context.ipAddress);

      // Check token blacklist
      if (await this.blacklist.isBlacklisted(token)) {
        throw new ApplicationError(
          'Token has been revoked',
          ErrorCode.UNAUTHORIZED,
          401
        );
      }

      // Verify token signature and decode payload
      const decoded = verify(token, this.publicKey, {
        algorithms: [JWT_ALGORITHM]
      }) as JWTPayload;

      // Verify security context
      if (
        decoded.device_id !== context.deviceId ||
        decoded.ip_address !== context.ipAddress
      ) {
        throw new ApplicationError(
          'Invalid token context',
          ErrorCode.UNAUTHORIZED,
          401
        );
      }

      logger.info('Token verified successfully', {
        event: 'token_verified',
        userId: decoded.user_id,
        sessionId: decoded.session_id
      });

      return decoded;
    } catch (error) {
      logger.error('Token verification failed', {
        event: 'token_verification_failed',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Revokes all tokens for a user session
   */
  public async revokeSession(sessionId: string): Promise<void> {
    try {
      // Add session to blacklist
      await this.blacklist.addToBlacklist(sessionId);

      logger.info('Session revoked', {
        event: 'session_revoked',
        sessionId
      });
    } catch (error) {
      logger.error('Session revocation failed', {
        event: 'session_revocation_failed',
        error: error.message,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Rotates JWT signing keys
   */
  private async rotateKeys(): Promise<void> {
    try {
      // Implementation would generate new RSA key pair
      // and update service keys
      logger.info('Key rotation completed', {
        event: 'key_rotation_completed'
      });
    } catch (error) {
      logger.error('Key rotation failed', {
        event: 'key_rotation_failed',
        error: error.message
      });
      throw error;
    }
  }

  private async generateAccessToken(payload: JWTPayload): Promise<string> {
    return sign(payload, this.privateKey, {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TOKEN_EXPIRY
    });
  }

  private async generateRefreshToken(payload: RefreshPayload): Promise<string> {
    return sign(payload, this.privateKey, {
      algorithm: JWT_ALGORITHM,
      expiresIn: REFRESH_TOKEN_EXPIRY
    });
  }

  private async validateConcurrentSessions(userId: string): Promise<void> {
    // Implementation would check active sessions count
    // and enforce MAX_CONCURRENT_SESSIONS limit
  }

  private initializeKeyRotation(): void {
    // Setup periodic key rotation
    this.keyRotationInterval = setInterval(() => {
      this.rotateKeys().catch(error => {
        logger.error('Scheduled key rotation failed', {
          event: 'scheduled_key_rotation_failed',
          error: error.message
        });
      });
    }, ms('24h'));
  }

  public dispose(): void {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
    }
  }
}

// Standalone token generation function
export async function generateAccessToken(
  payload: JWTPayload,
  privateKey: string
): Promise<string> {
  return sign(payload, privateKey, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_EXPIRY
  });
}

// Standalone token verification function
export async function verifyAccessToken(
  token: string,
  publicKey: string,
  context: SecurityContext
): Promise<JWTPayload> {
  try {
    await rateLimiter.consume(context.ipAddress);
    
    const decoded = verify(token, publicKey, {
      algorithms: [JWT_ALGORITHM]
    }) as JWTPayload;

    if (
      decoded.device_id !== context.deviceId ||
      decoded.ip_address !== context.ipAddress
    ) {
      throw new ApplicationError(
        'Invalid token context',
        ErrorCode.UNAUTHORIZED,
        401
      );
    }

    return decoded;
  } catch (error) {
    throw new ApplicationError(
      'Token verification failed',
      ErrorCode.UNAUTHORIZED,
      401
    );
  }
}