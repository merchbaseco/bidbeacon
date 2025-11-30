import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import type { Message } from '@aws-sdk/client-sqs';

// Create SQS client singleton
const sqsClient = new SQSClient({
    region: process.env.AWS_REGION || 'us-east-1',
});

const queueUrl = process.env.AMS_QUEUE_URL;
if (!queueUrl) {
    throw new Error('AMS_QUEUE_URL environment variable is required');
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

