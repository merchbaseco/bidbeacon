import { accountsRouter } from './routers/accounts';
import { adsRouter } from './routers/ads';
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
    metrics: metricsRouter,
    performance: performanceRouter,
    users: usersRouter,
    worker: workerRouter,
});

export type AppRouter = typeof appRouter;
