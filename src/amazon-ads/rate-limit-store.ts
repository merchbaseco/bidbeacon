import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { apiRateLimitState } from '@/db/schema';

export type StoredRateLimitState = {
    cooldownUntil: number;
    lastRateLimitAt: number;
    lastRetryAfterMs: number;
};

export const loadRateLimitState = async (key: string): Promise<StoredRateLimitState | null> => {
    try {
        const row = await db.query.apiRateLimitState.findFirst({
            where: eq(apiRateLimitState.key, key),
        });
        if (!row) {
            return null;
        }
        return {
            cooldownUntil: row.cooldownUntil.getTime(),
            lastRateLimitAt: row.lastRateLimitAt.getTime(),
            lastRetryAfterMs: row.lastRetryAfterMs,
        };
    } catch {
        return null;
    }
};

export const saveRateLimitState = async (key: string, state: StoredRateLimitState): Promise<void> => {
    try {
        await db
            .insert(apiRateLimitState)
            .values({
                key,
                cooldownUntil: new Date(state.cooldownUntil),
                lastRateLimitAt: new Date(state.lastRateLimitAt),
                lastRetryAfterMs: state.lastRetryAfterMs,
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: apiRateLimitState.key,
                set: {
                    cooldownUntil: new Date(state.cooldownUntil),
                    lastRateLimitAt: new Date(state.lastRateLimitAt),
                    lastRetryAfterMs: state.lastRetryAfterMs,
                    updatedAt: new Date(),
                },
            });
    } catch {
        // Rate-limit persistence must never replace the original Amazon response.
    }
};
