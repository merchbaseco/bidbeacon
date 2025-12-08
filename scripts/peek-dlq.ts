#!/usr/bin/env node
/**
 * Peek at DLQ messages without deleting them
 * 
 * Usage:
 *   tsx scripts/peek-dlq.ts [--limit N] [--dataset DATASET_ID]
 *   or: dotenv -e .env tsx scripts/peek-dlq.ts [--limit N] [--dataset DATASET_ID]
 * 
 * Options:
 *   --limit N        Number of messages to peek at (default: 10)
 *   --dataset ID      Filter by dataset_id (optional)
 * 
 * Environment variables:
 *   AMS_QUEUE_URL or AWS_QUEUE_URL - Main queue URL or ARN
 *   AWS_REGION - AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY - AWS credentials (or use ~/.aws/credentials)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { GetQueueAttributesCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

// Load .env file if it exists
try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim();
                // Remove quotes if present
                const cleanValue = value.replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = cleanValue;
                }
            }
        }
    }
} catch (error) {
    // .env file doesn't exist or can't be read, that's okay
}

const sqsClient = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Get DLQ URL from main queue's RedrivePolicy attribute
 */
async function getDlqUrlFromMainQueue(mainQueueUrl: string): Promise<string | null> {
    try {
        const command = new GetQueueAttributesCommand({
            QueueUrl: mainQueueUrl,
            AttributeNames: ['RedrivePolicy'],
        });

        const response = await sqsClient.send(command);
        const redrivePolicy = response.Attributes?.RedrivePolicy;

        if (!redrivePolicy) {
            return null;
        }

        // Parse RedrivePolicy JSON
        const policy = JSON.parse(redrivePolicy);
        const dlqArn = policy.deadLetterTargetArn;

        if (!dlqArn) {
            return null;
        }

        // Convert ARN to queue URL
        // ARN format: arn:aws:sqs:REGION:ACCOUNT_ID:QUEUE_NAME
        // URL format: https://sqs.REGION.amazonaws.com/ACCOUNT_ID/QUEUE_NAME
        const arnParts = dlqArn.split(':');
        if (arnParts.length !== 6 || arnParts[0] !== 'arn' || arnParts[1] !== 'aws' || arnParts[2] !== 'sqs') {
            console.warn('[SQS] Invalid DLQ ARN format:', dlqArn);
            return null;
        }

        const region = arnParts[3];
        const accountId = arnParts[4];
        const queueName = arnParts[5];

        return `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[SQS] Error getting DLQ URL from RedrivePolicy:', errorMessage);
        return null;
    }
}

/**
 * Parse AMS payload (handles both SNS envelope and raw payload)
 */
function parseAmsPayload(body: string | undefined): unknown {
    if (!body) {
        throw new Error('Message body is empty');
    }

    try {
        const parsed = JSON.parse(body);

        // Check if it's an SNS envelope
        if (parsed.Type === 'Notification' && parsed.Message) {
            // Parse the inner message
            return JSON.parse(parsed.Message);
        }

        // Otherwise, it's a raw AMS payload
        return parsed;
    } catch (error) {
        throw new Error(`Failed to parse message body: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Extract error information from message
 */
function extractErrorInfo(payload: unknown): {
    datasetId: string;
    errorType: string;
    errorDetails: string;
} {
    const datasetId =
        typeof payload === 'object' && payload !== null && 'dataset_id' in payload
            ? String(payload.dataset_id)
            : 'unknown';

    // Try to extract error information from the payload
    let errorType = 'Unknown';
    let errorDetails = '';

    if (typeof payload === 'object' && payload !== null) {
        // Check for common error fields
        if ('error' in payload) {
            errorType = 'Error field';
            errorDetails = JSON.stringify(payload.error);
        } else if ('errorMessage' in payload) {
            errorType = 'ErrorMessage field';
            errorDetails = String(payload.errorMessage);
        } else if ('errorCode' in payload) {
            errorType = 'ErrorCode field';
            errorDetails = String(payload.errorCode);
        }
    }

    return { datasetId, errorType, errorDetails };
}

/**
 * Peek at DLQ messages
 */
async function peekDlqMessages(dlqUrl: string, limit: number, filterDataset?: string): Promise<void> {
    console.log(`\n🔍 Peeking at DLQ messages (limit: ${limit}${filterDataset ? `, dataset: ${filterDataset}` : ''})...\n`);

    const messages: Array<{
        messageId: string;
        datasetId: string;
        payload: unknown;
        receivedAt: Date;
        approximateReceiveCount?: number;
    }> = [];

    let receivedCount = 0;
    const maxAttempts = Math.ceil(limit / 10); // SQS returns max 10 messages per request

    for (let attempt = 0; attempt < maxAttempts && receivedCount < limit; attempt++) {
        const command = new ReceiveMessageCommand({
            QueueUrl: dlqUrl,
            MaxNumberOfMessages: Math.min(10, limit - receivedCount),
            WaitTimeSeconds: 0, // Don't wait, just peek
            VisibilityTimeout: 30, // Hide messages for 30 seconds (they'll reappear)
            AttributeNames: ['ApproximateReceiveCount', 'SentTimestamp'],
        });

        const response = await sqsClient.send(command);
        const batch = response.Messages || [];

        for (const message of batch) {
            try {
                const payload = parseAmsPayload(message.Body);
                const { datasetId } = extractErrorInfo(payload);

                // Filter by dataset if specified
                if (filterDataset && datasetId !== filterDataset) {
                    continue;
                }

                messages.push({
                    messageId: message.MessageId || 'unknown',
                    datasetId,
                    payload,
                    receivedAt: message.Attributes?.SentTimestamp
                        ? new Date(parseInt(message.Attributes.SentTimestamp))
                        : new Date(),
                    approximateReceiveCount: message.Attributes?.ApproximateReceiveCount
                        ? parseInt(message.Attributes.ApproximateReceiveCount)
                        : undefined,
                });

                receivedCount++;
            } catch (error) {
                console.error(`[Error] Failed to parse message ${message.MessageId}:`, error);
            }
        }

        if (batch.length === 0) {
            break; // No more messages
        }
    }

    if (messages.length === 0) {
        console.log('✅ No messages found in DLQ (or all filtered out)\n');
        return;
    }

    // Group by dataset
    const byDataset = new Map<string, typeof messages>();
    for (const msg of messages) {
        if (!byDataset.has(msg.datasetId)) {
            byDataset.set(msg.datasetId, []);
        }
        byDataset.get(msg.datasetId)!.push(msg);
    }

    console.log(`📊 Found ${messages.length} message(s) in DLQ:\n`);

    // Display summary by dataset
    console.log('📈 Summary by dataset:');
    for (const [datasetId, msgs] of byDataset.entries()) {
        console.log(`   ${datasetId}: ${msgs.length} message(s)`);
    }
    console.log('');

    // Display details
    for (const [datasetId, msgs] of byDataset.entries()) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📦 Dataset: ${datasetId} (${msgs.length} message(s))`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (const msg of msgs.slice(0, 5)) { // Show max 5 per dataset
            console.log(`Message ID: ${msg.messageId}`);
            console.log(`Received: ${msg.receivedAt.toISOString()}`);
            if (msg.approximateReceiveCount) {
                console.log(`Receive Count: ${msg.approximateReceiveCount}`);
            }
            console.log(`Payload preview:`);
            console.log(JSON.stringify(msg.payload, null, 2).substring(0, 500));
            if (JSON.stringify(msg.payload).length > 500) {
                console.log('... (truncated)');
            }
            console.log('');
        }

        if (msgs.length > 5) {
            console.log(`... and ${msgs.length - 5} more message(s) for this dataset\n`);
        }
    }

    console.log('\n💡 Note: Messages were peeked but NOT deleted. They will become visible again after 30 seconds.\n');
}

async function main() {
    const args = process.argv.slice(2);
    let limit = 10;
    let filterDataset: string | undefined;

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            if (isNaN(limit) || limit < 1) {
                console.error('Error: --limit must be a positive number');
                process.exit(1);
            }
            i++;
        } else if (args[i] === '--dataset' && args[i + 1]) {
            filterDataset = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: tsx scripts/peek-dlq.ts [options]
   or: yarn peek-dlq [options]

The script automatically loads .env file from the project root.

Options:
  --limit N        Number of messages to peek at (default: 10)
  --dataset ID     Filter by dataset_id (optional)
  --help, -h       Show this help message

Environment variables (in .env file):
  AMS_QUEUE_URL or AWS_QUEUE_URL - Main queue URL or ARN (required)
  AWS_REGION - AWS region (default: us-east-1)
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY - AWS credentials (or use ~/.aws/credentials)

Examples:
  yarn peek-dlq
  yarn peek-dlq --limit 20
  yarn peek-dlq --dataset ads-campaign-management-campaigns
            `);
            process.exit(0);
        }
    }

    // Support both AMS_QUEUE_URL and AWS_QUEUE_URL (for ARN or URL)
    let mainQueueUrl = process.env.AMS_QUEUE_URL || process.env.AWS_QUEUE_URL;
    
    if (!mainQueueUrl) {
        console.error('Error: AMS_QUEUE_URL or AWS_QUEUE_URL environment variable is required');
        console.error('Please set it in .env file or as an environment variable');
        process.exit(1);
    }

    // If it's an ARN, convert it to a URL
    if (mainQueueUrl.startsWith('arn:aws:sqs:')) {
        const arnParts = mainQueueUrl.split(':');
        if (arnParts.length === 6 && arnParts[0] === 'arn' && arnParts[1] === 'aws' && arnParts[2] === 'sqs') {
            const region = arnParts[3];
            const accountId = arnParts[4];
            const queueName = arnParts[5];
            mainQueueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;
            console.log(`📝 Converted ARN to URL: ${mainQueueUrl}\n`);
        }
    }

    try {
        // Get DLQ URL from RedrivePolicy
        console.log('🔗 Getting DLQ URL from main queue RedrivePolicy...');
        const dlqUrl = await getDlqUrlFromMainQueue(mainQueueUrl);

        if (!dlqUrl) {
            console.error('Error: No DLQ configured for the main queue');
            process.exit(1);
        }

        console.log(`✅ Found DLQ: ${dlqUrl}\n`);

        // Peek at messages
        await peekDlqMessages(dlqUrl, limit, filterDataset);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();

