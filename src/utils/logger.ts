/**
 * Structured logging utility using pino.
 * Outputs JSON logs that can be easily filtered in log viewers like Dozzle.
 * Also forwards logs to PostHog Logs via OpenTelemetry if POSTHOG_PROJECT_TOKEN is configured.
 */

import { Writable } from 'node:stream';
import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import pino from 'pino';

// Initialize OpenTelemetry SDK for PostHog Logs if token is configured
let otelSdk: NodeSDK | null = null;
let otelLogger: ReturnType<typeof logs.getLogger> | null = null;

if (process.env.POSTHOG_PROJECT_TOKEN) {
    // PostHog Logs endpoint - defaults to US region, can be overridden
    // Format: https://us.i.posthog.com/i/v1/logs or https://eu.i.posthog.com/i/v1/logs
    const posthogLogsUrl = process.env.POSTHOG_LOGS_URL || `${process.env.POSTHOG_HOST || 'https://us.i.posthog.com'}/i/v1/logs`;
    const posthogToken = process.env.POSTHOG_PROJECT_TOKEN;

    otelSdk = new NodeSDK({
        resource: resourceFromAttributes({
            'service.name': process.env.SERVICE_NAME || 'bidbeacon',
        }),
        logRecordProcessor: new BatchLogRecordProcessor(
            new OTLPLogExporter({
                url: posthogLogsUrl,
                headers: {
                    Authorization: `Bearer ${posthogToken}`,
                },
            })
        ),
    });

    otelSdk.start();
    otelLogger = logs.getLogger('bidbeacon');

    // Shutdown OpenTelemetry SDK gracefully on process exit
    const shutdown = () => {
        otelSdk?.shutdown().catch(error => {
            process.stderr.write(`OpenTelemetry shutdown error: ${error.message}\n`);
        });
    };

    process.on('exit', shutdown);
    process.on('SIGINT', () => {
        shutdown();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        shutdown();
        process.exit(0);
    });
}

// Configure streams: stdout (for Docker logs) and optionally OpenTelemetry/PostHog
const streams: pino.Stream[] = [
    // Always log to stdout for Docker/container logs
    { stream: process.stdout },
];

// Add OpenTelemetry transport if configured
if (otelLogger) {
    // Create a custom stream that sends logs to OpenTelemetry
    const otelStream = new Writable({
        objectMode: true,
        write(chunk: unknown, _encoding, callback) {
            try {
                // Pino multistream passes the log object directly
                const log = chunk as Record<string, unknown>;
                const { level, msg, time, ...properties } = log;

                // Map Pino log levels (numbers) to OpenTelemetry severity text
                const levelLabel = pino.levels.labels[level as number] || 'UNKNOWN';
                const severityText = levelLabel.toUpperCase();

                // Convert Pino timestamp to number if needed
                const timestamp = typeof time === 'number' ? time : Date.now();

                otelLogger?.emit({
                    severityText,
                    body: (msg as string) || (properties.msg as string) || '',
                    timestamp,
                    attributes: {
                        ...properties,
                        level: levelLabel,
                    },
                });
            } catch (error) {
                // Silently fail OpenTelemetry logging to avoid breaking the app
                // Use console.error to avoid circular logging
                if (error instanceof Error) {
                    process.stderr.write(`OpenTelemetry logging error: ${error.message}\n`);
                }
            }
            callback();
        },
    });

    streams.push({
        stream: otelStream,
        level: process.env.LOG_LEVEL || 'info',
    });
}

// Base logger - outputs structured JSON to multiple streams
const baseLogger = pino(
    {
        level: process.env.LOG_LEVEL || 'info',
    },
    pino.multistream(streams)
);

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
