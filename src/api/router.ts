import { accountsRouter } from './routers/accounts';
import { adsRouter } from './routers/ads';
import { apiRouter } from './routers/api';
import { apiKeysRouter } from './routers/api-keys';
import { metricsRouter } from './routers/metrics';
import { performanceRouter } from './routers/performance';
import { reportsRouter } from './routers/reports';
import { usersRouter } from './routers/users';
import { workerRouter } from './routers/worker';
import { router } from './trpc';

export const appRouter = router({
    reports: reportsRouter,
    accounts: accountsRouter,
    ads: adsRouter,
    api: apiRouter,
    apiKeys: apiKeysRouter,
    metrics: metricsRouter,
    performance: performanceRouter,
    users: usersRouter,
    worker: workerRouter,
});

export type AppRouter = typeof appRouter;
