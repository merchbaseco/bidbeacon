import { eq } from 'drizzle-orm';
import type { Database } from '@/db/index';
import { adGroup, advertiserAccount, campaign } from '@/db/schema';
import type { AmsAccountLookup } from './account-resolution';

export const createDatabaseAmsAccountLookup = (database: Database): AmsAccountLookup => ({
    findByAdGroupId: async adGroupId => {
        const rows = await database.select({ accountId: campaign.accountId }).from(adGroup).innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId)).where(eq(adGroup.adGroupId, adGroupId));
        return rows.map(row => row.accountId);
    },
    findByAdvertiserId: async advertiserId => {
        const rows = await database.select({ accountId: advertiserAccount.adsAccountId }).from(advertiserAccount).where(eq(advertiserAccount.entityId, advertiserId));
        return rows.map(row => row.accountId);
    },
    findByCampaignId: async campaignId => {
        const rows = await database.select({ accountId: campaign.accountId }).from(campaign).where(eq(campaign.campaignId, campaignId));
        return rows.map(row => row.accountId);
    },
});
