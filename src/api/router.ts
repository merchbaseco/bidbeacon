import { accountsRouter } from './routers/accounts.js';
import { metricsRouter } from './routers/metrics.js';
import { reportsRouter } from './routers/reports.js';
import { usersRouter } from './routers/users.js';
import { workerRouter } from './routers/worker.js';
import { router } from './trpc.js';

export const appRouter = router({
    reports: reportsRouter,
    accounts: accountsRouter,
    metrics: metricsRouter,
    users: usersRouter,
    worker: workerRouter,
});

export type AppRouter = typeof appRouter;
