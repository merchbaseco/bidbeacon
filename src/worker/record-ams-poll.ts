import type { Database } from '@/db/index';
import { workerControl } from '@/db/schema';

export const recordAmsPoll = async (database: Database, polledAt: Date) => {
    await database
        .insert(workerControl)
        .values({
            enabled: true,
            id: 'main',
            lastPolledAt: polledAt,
            messagesPerSecond: 0,
        })
        .onConflictDoUpdate({
            set: {
                lastPolledAt: polledAt,
            },
            target: workerControl.id,
        });
};
