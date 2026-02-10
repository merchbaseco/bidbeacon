import { accountsRouter } from './app/accounts';
import { adsRouter } from './app/ads';
import { apiKeysRouter } from './app/api-keys';
import { metricsRouter } from './app/metrics';
import { performanceRouter } from './app/performance';
import { reportsRouter } from './app/reports';
import { usersRouter } from './app/users';
import { workerRouter } from './app/worker';
import { publicApiRouter } from './public/router';
import { router } from './trpc';

export const appRouter = router({
    reports: reportsRouter,
    accounts: accountsRouter,
    ads: adsRouter,
    api: publicApiRouter,
    apiKeys: apiKeysRouter,
    metrics: metricsRouter,
    performance: performanceRouter,
    users: usersRouter,
    worker: workerRouter,
});

export type AppRouter = typeof appRouter;
