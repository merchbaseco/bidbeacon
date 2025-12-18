/**
 * Structured logging utility using pino.
 * Outputs JSON logs that can be easily filtered in log viewers like Dozzle.
 * Uses pino-pretty for human-readable output in development.
 */

import pino from 'pino';

// Use pino-pretty in development, JSON in production
const isDevelopment = process.env.NODE_ENV !== 'production';

// Base logger - outputs structured JSON (or pretty in dev)
const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: isDevelopment
        ? {
              target: 'pino-pretty',
              options: {
                  colorize: true,
                  translateTime: 'HH:MM:ss.l',
                  ignore: 'pid,hostname',
              },
          }
        : undefined,
});

/**
 * Create a child logger with job-specific context.
 * This makes it easy to filter logs by jobId, jobName, etc. in Dozzle.
 *
 * @example
 * const logger = createJobLogger('refresh-report-datum', job.id, { accountId, countryCode });
 * logger.info('Starting job');
 * // Output: {"level":30,"time":1234567890,"jobName":"refresh-report-datum","jobId":"abc123","accountId":"123","countryCode":"US","msg":"Starting job"}
 */
export function createJobLogger(jobName: string, jobId: string, context?: Record<string, unknown>): pino.Logger {
    return baseLogger.child({
        jobName,
        jobId,
        ...context,
    });
}

/**
 * Create a child logger with custom context (for non-job contexts like worker, API, etc.).
 *
 * @example
 * const logger = createContextLogger({ component: 'worker', messageId: 'msg-123' });
 * logger.info('Processing message');
 */
export function createContextLogger(context: Record<string, unknown>): pino.Logger {
    return baseLogger.child(context);
}

/**
 * Base logger for general use (e.g., entry points, utils).
 */
export const logger = baseLogger;
