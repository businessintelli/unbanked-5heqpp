// External imports
import pino from 'pino'; // v8.15.0
import pretty from 'pino-pretty'; // v10.2.0

// Internal imports
import { AuditLog, ErrorCode } from '../../types/common';
import { ApplicationError } from '../common/errors';

// Environment variables with defaults
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV;
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '90', 10);
const ENABLE_TRACE = process.env.ENABLE_TRACE === 'true';

// Constants
const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'key', 'authorization'];
const MAX_MESSAGE_SIZE = 10000;

/**
 * Logger configuration options interface
 */
interface LoggerOptions {
  level?: string;
  enableTrace?: boolean;
  retention?: number;
  pretty?: boolean;
  redact?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Audit logging options interface
 */
interface AuditOptions {
  retention?: number;
  encrypt?: boolean;
  compliance?: string[];
  geoData?: {
    ip: string;
    country: string;
    region: string;
  };
}

/**
 * Metadata enricher for adding context to logs
 */
class MetadataEnricher {
  private baseMetadata: Record<string, unknown>;

  constructor(metadata: Record<string, unknown> = {}) {
    this.baseMetadata = {
      environment: NODE_ENV,
      version: process.env.npm_package_version,
      ...metadata
    };
  }

  enrich(metadata: Record<string, unknown>): Record<string, unknown> {
    return {
      ...this.baseMetadata,
      ...metadata,
      timestamp: new Date().toISOString()
    };
  }

  redactSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
    const redacted = { ...data };
    for (const [key, value] of Object.entries(redacted)) {
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = this.redactSensitiveData(value as Record<string, unknown>);
      }
    }
    return redacted;
  }
}

/**
 * Core logger class providing comprehensive logging capabilities
 */
export class Logger {
  private logger: pino.Logger;
  private name: string;
  private options: LoggerOptions;
  private enricher: MetadataEnricher;

  constructor(name: string, options: LoggerOptions = {}) {
    this.name = name;
    this.options = {
      level: options.level || LOG_LEVEL,
      enableTrace: options.enableTrace ?? ENABLE_TRACE,
      retention: options.retention || LOG_RETENTION_DAYS,
      pretty: options.pretty ?? NODE_ENV === 'development',
      redact: [...(options.redact || []), ...SENSITIVE_FIELDS],
      metadata: options.metadata || {}
    };

    this.enricher = new MetadataEnricher(this.options.metadata);

    const pinoOptions: pino.LoggerOptions = {
      level: this.options.level,
      name: this.name,
      redact: this.options.redact,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label.toUpperCase() })
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res
      }
    };

    if (this.options.pretty) {
      this.logger = pino(pinoOptions, pretty({
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }));
    } else {
      this.logger = pino(pinoOptions);
    }
  }

  /**
   * Logs information level messages with metadata enrichment
   */
  info(message: string, metadata: Record<string, unknown> = {}): void {
    const enrichedMetadata = this.enricher.enrich(metadata);
    const formattedMessage = this.formatLogMessage(message, enrichedMetadata);
    this.logger.info(formattedMessage);
  }

  /**
   * Logs warning level messages
   */
  warn(message: string, metadata: Record<string, unknown> = {}): void {
    const enrichedMetadata = this.enricher.enrich(metadata);
    const formattedMessage = this.formatLogMessage(message, enrichedMetadata);
    this.logger.warn(formattedMessage);
  }

  /**
   * Logs debug level messages
   */
  debug(message: string, metadata: Record<string, unknown> = {}): void {
    const enrichedMetadata = this.enricher.enrich(metadata);
    const formattedMessage = this.formatLogMessage(message, enrichedMetadata);
    this.logger.debug(formattedMessage);
  }

  /**
   * Logs error level messages with enhanced error details
   */
  error(error: Error | ApplicationError, metadata: Record<string, unknown> = {}): void {
    const errorDetails: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };

    if (error instanceof ApplicationError) {
      errorDetails.code = error.code;
      errorDetails.statusCode = error.statusCode;
      errorDetails.details = error.details;
      errorDetails.correlationId = error.correlationId;
    } else {
      errorDetails.code = ErrorCode.INTERNAL_ERROR;
    }

    const enrichedMetadata = this.enricher.enrich({ ...metadata, error: errorDetails });
    const formattedMessage = this.formatLogMessage(error.message, enrichedMetadata);
    this.logger.error(formattedMessage);
  }

  /**
   * Logs audit events for compliance and tracking
   */
  audit(auditLog: AuditLog, options: AuditOptions = {}): void {
    const auditMetadata = {
      type: 'AUDIT',
      userId: auditLog.user_id,
      action: auditLog.action,
      resource: auditLog.resource,
      details: this.enricher.redactSensitiveData(auditLog.details),
      ipAddress: auditLog.ip_address,
      userAgent: auditLog.user_agent,
      category: auditLog.category,
      severity: auditLog.severity,
      retention: options.retention || this.options.retention,
      compliance: options.compliance || [],
      geoData: options.geoData,
      timestamp: auditLog.timestamp.toISOString(),
      correlationId: auditLog.correlation_id
    };

    const enrichedMetadata = this.enricher.enrich(auditMetadata);
    const formattedMessage = this.formatLogMessage(
      `Audit: ${auditLog.action} on ${auditLog.resource}`,
      enrichedMetadata
    );

    this.logger.info(formattedMessage);
  }

  /**
   * Formats log messages with consistent structure
   */
  private formatLogMessage(
    message: string,
    metadata: Record<string, unknown>
  ): Record<string, unknown> {
    // Truncate long messages
    const truncatedMessage = message.length > MAX_MESSAGE_SIZE
      ? `${message.substring(0, MAX_MESSAGE_SIZE)}...`
      : message;

    return {
      message: truncatedMessage,
      ...this.enricher.redactSensitiveData(metadata),
      source: this.name,
      traceId: this.options.enableTrace ? crypto.randomUUID() : undefined
    };
  }
}

/**
 * Creates a new logger instance with specified configuration
 */
export function createLogger(name: string, options?: LoggerOptions): Logger {
  return new Logger(name, options);
}