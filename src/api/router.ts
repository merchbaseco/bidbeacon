import { db } from '@/db/index';
import { accountsRouter } from './app/accounts';
import { adsRouter } from './app/ads';
import { createEntityHistoryRouter } from './app/entity-history';
import { metricsRouter } from './app/metrics';
import { performanceRouter } from './app/performance';
import { reportsRouter } from './app/reports';
import { usersRouter } from './app/users';
import { workerRouter } from './app/worker';
import { devRouter } from './dev/router';
import { publicOperationProcedures } from './public/operation-router';
import { publicApiRouter } from './public/router';
import { router } from './trpc';

export const appRouter = router({
    reports: reportsRouter,
    accounts: accountsRouter,
    ads: adsRouter,
    entityHistory: createEntityHistoryRouter(db),
    api: publicApiRouter,
    dev: devRouter,
    metrics: metricsRouter,
    performanceTable: performanceRouter,
    users: usersRouter,
    worker: workerRouter,
    ...publicOperationProcedures,
});

export type AppRouter = typeof appRouter;
