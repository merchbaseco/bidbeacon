import { router } from '@/api/trpc';
import { accountsApiRouter } from './api/accounts';
import { adsApiRouter } from './api/ads';
import { cliApiRouter } from './api/cli';
import { performanceApiRouter } from './api/performance';
import { reportsApiRouter } from './api/reports';
import { usersApiRouter } from './api/users';

export const apiRouter = router({
    accounts: accountsApiRouter,
    ads: adsApiRouter,
    cli: cliApiRouter,
    performance: performanceApiRouter,
    reports: reportsApiRouter,
    users: usersApiRouter,
});
