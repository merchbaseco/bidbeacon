const TRANSIENT_DATABASE_CODES = new Set(['40001', '40P01', '55P03']);

type DatabaseRetryOptions = {
    attempts?: number;
    baseDelayMs?: number;
    random?: () => number;
};

export const withDatabaseRetry = async <T>(operation: () => Promise<T>, options: DatabaseRetryOptions = {}): Promise<T> => {
    const attempts = Math.max(1, options.attempts ?? 3);
    const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
    const random = options.random ?? Math.random;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !isTransientDatabaseError(error)) {
                throw error;
            }

            const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);
            const jitter = Math.floor(random() * baseDelayMs);
            await sleep(exponentialDelay + jitter);
        }
    }

    throw new Error('Database operation exhausted retries without returning or throwing.');
};

export const isTransientDatabaseError = (error: unknown): boolean => {
    let current = error;
    for (let depth = 0; depth < 5; depth++) {
        if (typeof current !== 'object' || current === null) {
            return false;
        }
        if ('code' in current && typeof current.code === 'string' && TRANSIENT_DATABASE_CODES.has(current.code)) {
            return true;
        }
        if (!('cause' in current) || current.cause === current) {
            return false;
        }
        current = current.cause;
    }
    return false;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
