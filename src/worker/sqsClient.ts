import type { Message } from '@aws-sdk/client-sqs';
import {
    DeleteMessageCommand,
    GetQueueAttributesCommand,
    ReceiveMessageCommand,
    SQSClient,
} from '@aws-sdk/client-sqs';
import {
    CloudWatchClient,
    GetMetricStatisticsCommand,
    type Datapoint,
} from '@aws-sdk/client-cloudwatch';

// Create SQS client singleton
const sqsClient = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

// Create CloudWatch client singleton
const cloudWatchClient = new CloudWatchClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const queueUrl = process.env.AMS_QUEUE_URL;
if (!queueUrl) {
    throw new Error('AMS_QUEUE_URL environment variable is required');
}

/**
 * Test AWS credentials and queue access at startup
 * Throws if credentials are missing or invalid
 */
export async function testAwsConnection(): Promise<void> {
    try {
        // Try to get queue attributes - this will fail if credentials are missing
        const command = new GetQueueAttributesCommand({
            QueueUrl: queueUrl,
            AttributeNames: ['QueueArn'],
        });
        await sqsClient.send(command);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Credentials') || errorMessage.includes('credentials')) {
            throw new Error(
                `AWS credentials not found. Provide credentials via IAM role, AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY env vars, or ~/.aws/credentials file. Error: ${errorMessage}`
            );
        }
        throw error;
    }
}

/**
 * Receive messages from SQS queue using long polling
 * @returns Array of messages, or empty array if none received
 */
export async function receiveMessages(): Promise<Message[]> {
    const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        WaitTimeSeconds: 10, // Long polling
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 30, // Give worker 30 seconds to process before retry
    });

    const response = await sqsClient.send(command);
    return response.Messages || [];
}

/**
 * Delete a message from the SQS queue after successful processing
 * @param receiptHandle - The receipt handle from the message
 */
export async function deleteMessage(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
    });

    await sqsClient.send(command);
}

/**
 * Extract queue name from SQS queue URL
 * Example: https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue -> MyQueue
 */
function extractQueueName(queueUrl: string): string {
    const parts = queueUrl.split('/');
    return parts[parts.length - 1];
}

/**
 * Get queue metrics from CloudWatch
 * @param queueUrl - The SQS queue URL
 * @param metricName - The CloudWatch metric name (e.g., 'NumberOfMessagesReceived')
 * @param startTime - Start time for metrics query
 * @param endTime - End time for metrics query
 * @returns Array of metric values (one per minute)
 */
async function getQueueMetric(
    queueUrl: string,
    metricName: string,
    startTime: Date,
    endTime: Date
): Promise<number[]> {
    const queueName = extractQueueName(queueUrl);

    const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/SQS',
        MetricName: metricName,
        Dimensions: [
            {
                Name: 'QueueName',
                Value: queueName,
            },
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 60, // 1 minute periods
        Statistics: ['Sum'],
    });

    const response = await cloudWatchClient.send(command);
    const datapoints = (response.Datapoints || []).sort(
        (a, b) => (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0)
    );

    // Fill in missing minutes with 0
    const values: number[] = [];
    const minuteMap = new Map<number, number>();

    for (const point of datapoints) {
        if (point.Timestamp && point.Sum !== undefined) {
            const minute = Math.floor(point.Timestamp.getTime() / 60000);
            minuteMap.set(minute, point.Sum);
        }
    }

    // Generate array of 60 values (one per minute)
    const startMinute = Math.floor(startTime.getTime() / 60000);
    for (let i = 0; i < 60; i++) {
        const minute = startMinute + i;
        values.push(minuteMap.get(minute) || 0);
    }

    return values;
}

/**
 * Get approximate number of messages visible in queue
 */
async function getApproximateVisibleMessages(queueUrl: string): Promise<number> {
    const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
    });

    const response = await sqsClient.send(command);
    const attr = response.Attributes?.ApproximateNumberOfMessages;
    return attr ? parseInt(attr, 10) : 0;
}

/**
 * Get approximate age of oldest message in queue (seconds)
 */
async function getOldestMessageAge(queueUrl: string): Promise<number> {
    const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateAgeOfOldestMessage'],
    });

    const response = await sqsClient.send(command);
    const attr = response.Attributes?.ApproximateAgeOfOldestMessage;
    return attr ? parseInt(attr, 10) : 0;
}

/**
 * Get comprehensive queue metrics for monitoring
 * @param queueUrl - The SQS queue URL
 * @returns Queue metrics including sparkline data and summary stats
 */
export async function getQueueMetrics(queueUrl: string): Promise<{
    sparkline: number[];
    messagesLastHour: number;
    messagesLast24h: number;
    approximateVisible: number;
    oldestMessageAge: number;
}> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get sparkline data (last 60 minutes)
    const sparkline = await getQueueMetric(
        queueUrl,
        'NumberOfMessagesReceived',
        oneHourAgo,
        now
    );

    // Get last hour total
    const messagesLastHour = sparkline.reduce((sum, val) => sum + val, 0);

    // Get last 24 hours total
    const last24hData = await getQueueMetric(
        queueUrl,
        'NumberOfMessagesReceived',
        oneDayAgo,
        now
    );
    const messagesLast24h = last24hData.reduce((sum, val) => sum + val, 0);

    // Get current queue state
    const approximateVisible = await getApproximateVisibleMessages(queueUrl);
    const oldestMessageAge = await getOldestMessageAge(queueUrl);

    return {
        sparkline,
        messagesLastHour,
        messagesLast24h,
        approximateVisible,
        oldestMessageAge,
    };
}
