import { accountsRouter } from './app/accounts';
import { adsRouter } from './app/ads';
import { metricsRouter } from './app/metrics';
import { performanceRouter } from './app/performance';
import { reportsRouter } from './app/reports';
import { usersRouter } from './app/users';
import { workerRouter } from './app/worker';
import { clientRestProcedures } from './public/client-rest';
import { publicApiRouter } from './public/router';
import { router } from './trpc';

export const appRouter = router({
    reports: reportsRouter,
    accounts: accountsRouter,
    ads: adsRouter,
    api: publicApiRouter,
    metrics: metricsRouter,
    performance: performanceRouter,
    users: usersRouter,
    worker: workerRouter,
    ...clientRestProcedures,
});

export type AppRouter = typeof appRouter;
