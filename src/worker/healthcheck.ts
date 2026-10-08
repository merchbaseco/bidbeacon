import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { workerControl } from '@/db/schema';
import { healthChecks } from '@/health/health-checks';

const main = async () => {
    try {
        const maxAgeMs = amsPollMaxAgeMs();
        if (maxAgeMs === null) {
            process.exit(1);
        }

        const rows = await db.select({ lastPolledAt: workerControl.lastPolledAt }).from(workerControl).where(eq(workerControl.id, 'main')).limit(1);
        const lastPolledAt = rows[0]?.lastPolledAt ?? null;
        const observedAt = new Date();
        const fresh = lastPolledAt !== null && observedAt.getTime() - lastPolledAt.getTime() < maxAgeMs;
        process.exit(fresh ? 0 : 1);
    } catch {
        process.exit(1);
    }
};

const amsPollMaxAgeMs = () => {
    for (const check of healthChecks) {
        switch (check.kind) {
            case 'poll':
                return check.maxAgeMs;
            case 'database':
            case 'job':
                break;
            default: {
                const unexpected: never = check;
                throw new Error(`Unexpected health check kind: ${String(unexpected)}`);
            }
        }
    }

    return null;
};

main().catch(() => {
    process.exit(1);
});
