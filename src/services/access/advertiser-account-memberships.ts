import { eq } from 'drizzle-orm';
import type { Database } from '@/db/index';
import { userAccountAccess } from '@/db/schema';

export const expandAdvertiserAccountMemberships = async (
    database: Database,
    input: {
        actorMerchbaseUserId: string;
        adsAccountId: string;
        advertiserAccountId: string;
    }
) => {
    const existingMembers = await database.select({ merchbaseUserId: userAccountAccess.merchbaseUserId }).from(userAccountAccess).where(eq(userAccountAccess.adsAccountId, input.adsAccountId));
    const merchbaseUserIds = [...new Set([input.actorMerchbaseUserId, ...existingMembers.map(member => member.merchbaseUserId)])];

    await database
        .insert(userAccountAccess)
        .values(
            merchbaseUserIds.map(merchbaseUserId => ({
                advertiserAccountId: input.advertiserAccountId,
                adsAccountId: input.adsAccountId,
                merchbaseUserId,
            }))
        )
        .onConflictDoNothing();
};
