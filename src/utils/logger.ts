/**
 * Structured logging utility using pino.
 * Outputs pretty, human-readable logs using pino-pretty.
 */

import pino from 'pino';

// Base logger - outputs pretty formatted logs
const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
        },
    },
});

/**
 * Create a child logger with job-specific context.
 * This makes it easy to filter logs by jobId, jobName, etc. in Dozzle.
 *
 * @example
 * const logger = createJobLogger('update-report-status', job.id, { accountId, countryCode });
 * logger.info('Starting job');
 * // Output: {"level":30,"time":1234567890,"jobName":"update-report-status","jobId":"abc123","accountId":"123","countryCode":"US","msg":"Starting job"}
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
