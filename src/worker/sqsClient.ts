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
 * Get approximate age of oldest message in queue (seconds) from CloudWatch
 * Returns 0 if metric is not available or queue is empty
 * Note: This is a CloudWatch metric, not a queue attribute
 */
async function getOldestMessageAge(queueUrl: string): Promise<number> {
    try {
        const queueName = extractQueueName(queueUrl);
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

        const command = new GetMetricStatisticsCommand({
            Namespace: 'AWS/SQS',
            MetricName: 'ApproximateAgeOfOldestMessage',
            Dimensions: [
                {
                    Name: 'QueueName',
                    Value: queueName,
                },
            ],
            StartTime: fiveMinutesAgo,
            EndTime: now,
            Period: 60,
            Statistics: ['Average'],
        });

        const response = await cloudWatchClient.send(command);
        const datapoints = response.Datapoints || [];

        if (datapoints.length === 0) {
            // No data means queue is likely empty
            return 0;
        }

        // Get the most recent datapoint
        const sorted = datapoints.sort(
            (a, b) => (b.Timestamp?.getTime() || 0) - (a.Timestamp?.getTime() || 0)
        );
        const latest = sorted[0];
        return latest.Average ? Math.round(latest.Average) : 0;
    } catch (error) {
        // Metric might not be available if queue is empty or CloudWatch hasn't reported it yet
        // Return 0 as a safe default
        return 0;
    }
}

/**
 * Get total count of a metric over a time period
 */
async function getMetricTotal(
    queueUrl: string,
    metricName: string,
    startTime: Date,
    endTime: Date
): Promise<number> {
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
        Period: 60,
        Statistics: ['Sum'],
    });

    const response = await cloudWatchClient.send(command);
    const datapoints = response.Datapoints || [];

    return datapoints.reduce((sum, point) => sum + (point.Sum || 0), 0);
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
    messagesSentLastHour: number;
    messagesSentLast24h: number;
    messagesReceivedLastHour: number;
    messagesReceivedLast24h: number;
    messagesDeletedLastHour: number;
    messagesDeletedLast24h: number;
}> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get sparkline data (last 60 minutes) - using NumberOfMessagesReceived
    const sparkline = await getQueueMetric(
        queueUrl,
        'NumberOfMessagesReceived',
        oneHourAgo,
        now
    );

    // Get last hour totals for all metrics
    const [
        messagesReceivedLastHour,
        messagesSentLastHour,
        messagesDeletedLastHour,
    ] = await Promise.all([
        getMetricTotal(queueUrl, 'NumberOfMessagesReceived', oneHourAgo, now),
        getMetricTotal(queueUrl, 'NumberOfMessagesSent', oneHourAgo, now),
        getMetricTotal(queueUrl, 'NumberOfMessagesDeleted', oneHourAgo, now),
    ]);

    // Get last 24 hours totals
    const [
        messagesReceivedLast24h,
        messagesSentLast24h,
        messagesDeletedLast24h,
    ] = await Promise.all([
        getMetricTotal(queueUrl, 'NumberOfMessagesReceived', oneDayAgo, now),
        getMetricTotal(queueUrl, 'NumberOfMessagesSent', oneDayAgo, now),
        getMetricTotal(queueUrl, 'NumberOfMessagesDeleted', oneDayAgo, now),
    ]);

    // Get current queue state
    const approximateVisible = await getApproximateVisibleMessages(queueUrl);
    const oldestMessageAge = await getOldestMessageAge(queueUrl);

    return {
        sparkline,
        messagesLastHour: messagesReceivedLastHour, // Keep for backward compatibility
        messagesLast24h: messagesReceivedLast24h, // Keep for backward compatibility
        approximateVisible,
        oldestMessageAge,
        messagesSentLastHour,
        messagesSentLast24h,
        messagesReceivedLastHour,
        messagesReceivedLast24h,
        messagesDeletedLastHour,
        messagesDeletedLast24h,
    };
}
