import { router } from '@/api/trpc';
import { accountsApiRouter } from './accounts';
import { adsApiRouter } from './ads';
import { clientApiRouter } from './client';
import { performanceApiRouter } from './performance';
import { reportsApiRouter } from './reports';
import { usersApiRouter } from './users';

export const publicApiRouter = router({
    accounts: accountsApiRouter,
    ads: adsApiRouter,
    client: clientApiRouter,
    cli: clientApiRouter,
    performance: performanceApiRouter,
    reports: reportsApiRouter,
    users: usersApiRouter,
});
