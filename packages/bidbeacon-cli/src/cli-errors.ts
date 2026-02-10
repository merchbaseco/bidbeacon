import type { HelpTopicKey } from './help';

export class CliUsageError extends Error {
    topicKey: HelpTopicKey;
    exitCode: number;

    constructor(input: { topicKey: HelpTopicKey; message: string; exitCode?: number }) {
        super(input.message);
        this.topicKey = input.topicKey;
        this.exitCode = input.exitCode ?? 1;
    }
}

export const isCliUsageError = (error: unknown): error is CliUsageError => {
    return error instanceof CliUsageError;
};

