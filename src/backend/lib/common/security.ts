// External imports
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto'; // node:crypto
import * as argon2 from 'argon2'; // v2.0.0
import { AES, mode, pad } from 'crypto-js/aes'; // v4.2.0
import { KMSClient, GenerateDataKeyCommand, DecryptCommand } from '@aws-sdk/client-kms'; // v3.0.0
import { createLogger, format, transports } from 'winston'; // v3.8.0

// Internal imports
import { ValidationError } from './errors';

// Global constants
const ENCRYPTION_KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const HASH_ITERATIONS = 3;
const ARGON2_MEMORY_COST = 65536; // 64MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;
const KEY_ROTATION_INTERVAL = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds

// Types
interface EncryptionContext {
  userId: string;
  purpose: string;
  timestamp: number;
}

interface EncryptedField {
  value: string;
  iv: string;
  keyId: string;
  context: EncryptionContext;
  version: number;
}

interface CachedKey {
  key: Buffer;
  createdAt: number;
  expiresAt: number;
}

interface KMSConfig {
  keyId: string;
  region: string;
}

// Security logger configuration
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'security-service' },
  transports: [
    new transports.File({ filename: 'security-events.log' })
  ]
});

/**
 * Validates password strength against NIST requirements
 */
function validatePasswordStrength(password: string): boolean {
  if (password.length < 8) return false;
  if (password.length > 64) return false;
  if (/(.)\1{2,}/.test(password)) return false; // Check for repeated characters
  return true;
}

/**
 * Hashes a password using NIST-compliant Argon2id algorithm
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    if (!validatePasswordStrength(password)) {
      throw new ValidationError({
        code: 'invalid_password',
        message: 'Password does not meet security requirements'
      });
    }

    const salt = randomBytes(SALT_LENGTH);
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      salt
    });

    logger.info('Password hash created', {
      event: 'password_hash_created',
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST
    });

    return hash;
  } catch (error) {
    logger.error('Password hashing failed', {
      event: 'password_hash_failed',
      error: error.message
    });
    throw error;
  }
}

/**
 * Verifies a password against its hash with timing attack protection
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const isValid = await argon2.verify(hash, password, {
      type: argon2.argon2id
    });

    logger.info('Password verification attempt', {
      event: 'password_verify_attempt',
      success: isValid
    });

    return isValid;
  } catch (error) {
    logger.error('Password verification failed', {
      event: 'password_verify_error',
      error: error.message
    });
    throw error;
  }
}

/**
 * Enhanced encryption service with key rotation and audit support
 */
export class EncryptionService {
  private kmsClient: KMSClient;
  private keyCache: Map<string, CachedKey>;
  private logger: typeof logger;

  constructor(private kmsConfig: KMSConfig) {
    this.kmsClient = new KMSClient({ region: kmsConfig.region });
    this.keyCache = new Map();
    this.logger = logger;
    this.startKeyRotation();
  }

  /**
   * Encrypts a field value with key derivation and rotation
   */
  async encryptField(
    value: string,
    fieldKey: string,
    context: EncryptionContext
  ): Promise<EncryptedField> {
    try {
      // Generate a new data key using KMS
      const dataKeyCommand = new GenerateDataKeyCommand({
        KeyId: this.kmsConfig.keyId,
        KeySpec: 'AES_256'
      });

      const dataKey = await this.kmsClient.send(dataKeyCommand);
      const iv = randomBytes(IV_LENGTH);

      // Encrypt the value
      const cipher = createCipheriv('aes-256-gcm', dataKey.Plaintext as Buffer, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final()
      ]);

      const encryptedField: EncryptedField = {
        value: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        keyId: dataKey.KeyId!,
        context,
        version: 1
      };

      this.logger.info('Field encryption completed', {
        event: 'field_encrypted',
        keyId: dataKey.KeyId,
        context: context.purpose
      });

      return encryptedField;
    } catch (error) {
      this.logger.error('Field encryption failed', {
        event: 'field_encryption_failed',
        error: error.message,
        context: context.purpose
      });
      throw error;
    }
  }

  /**
   * Decrypts an encrypted field value
   */
  async decryptField(encryptedField: EncryptedField): Promise<string> {
    try {
      // Decrypt the data key using KMS
      const decryptCommand = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedField.value, 'base64'),
        KeyId: encryptedField.keyId
      });

      const decryptedKey = await this.kmsClient.send(decryptCommand);
      const iv = Buffer.from(encryptedField.iv, 'base64');

      // Decrypt the value
      const decipher = createDecipheriv('aes-256-gcm', decryptedKey.Plaintext as Buffer, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedField.value, 'base64')),
        decipher.final()
      ]);

      this.logger.info('Field decryption completed', {
        event: 'field_decrypted',
        keyId: encryptedField.keyId,
        context: encryptedField.context.purpose
      });

      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error('Field decryption failed', {
        event: 'field_decryption_failed',
        error: error.message,
        context: encryptedField.context.purpose
      });
      throw error;
    }
  }

  /**
   * Performs key rotation based on schedule
   */
  private async rotateKeys(): Promise<void> {
    try {
      const now = Date.now();
      for (const [keyId, cachedKey] of this.keyCache.entries()) {
        if (now >= cachedKey.expiresAt) {
          // Generate new key
          const dataKeyCommand = new GenerateDataKeyCommand({
            KeyId: this.kmsConfig.keyId,
            KeySpec: 'AES_256'
          });

          const newKey = await this.kmsClient.send(dataKeyCommand);
          
          // Update cache with new key
          this.keyCache.set(keyId, {
            key: newKey.Plaintext as Buffer,
            createdAt: now,
            expiresAt: now + KEY_ROTATION_INTERVAL
          });

          this.logger.info('Key rotated successfully', {
            event: 'key_rotated',
            keyId
          });
        }
      }
    } catch (error) {
      this.logger.error('Key rotation failed', {
        event: 'key_rotation_failed',
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Starts the key rotation scheduler
   */
  private startKeyRotation(): void {
    setInterval(() => {
      this.rotateKeys().catch(error => {
        this.logger.error('Scheduled key rotation failed', {
          event: 'scheduled_rotation_failed',
          error: error.message
        });
      });
    }, KEY_ROTATION_INTERVAL);
  }
}