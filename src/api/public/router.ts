import { router } from '@/api/trpc';
import { accountsApiRouter } from './accounts';
import { adsApiRouter } from './ads';
import { performanceApiRouter } from './performance';
import { reportsApiRouter } from './reports';
import { usersApiRouter } from './users';

export const publicApiRouter = router({
    accounts: accountsApiRouter,
    ads: adsApiRouter,
    performance: performanceApiRouter,
    reports: reportsApiRouter,
    users: usersApiRouter,
});
