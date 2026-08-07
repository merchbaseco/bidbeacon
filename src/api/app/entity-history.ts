import { TRPCError } from '@trpc/server';
import { formatInTimeZone } from 'date-fns-tz';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { privateProcedure, router } from '@/api/trpc';
import { campaign, entityChangeHistory, target } from '@/db/schema';
import type { OperationDatabase } from '@/operations/operation-context';
import { getTimezoneForCountry } from '@/utils/timezones';

type EntityHistoryDatabase = Pick<OperationDatabase, 'select'>;

export const createEntityHistoryRouter = (database: EntityHistoryDatabase, now: () => Date = () => new Date()) =>
    router({
        latestTargetBidChange: privateProcedure
            .input(
                z
                    .object({
                        accountId: z.string().min(1),
                        targetId: z.string().min(1),
                    })
                    .strict()
            )
            .output(
                z
                    .object({
                        changedAt: z.string(),
                        previousValue: z.string().nullable(),
                        newValue: z.string().nullable(),
                    })
                    .nullable()
            )
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const [accountTarget] = await database
                    .select({ countryCode: campaign.countryCode })
                    .from(target)
                    .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
                    .where(and(eq(target.targetId, input.targetId), eq(campaign.accountId, input.accountId)))
                    .limit(1);

                if (!accountTarget) {
                    throw new TRPCError({ code: 'NOT_FOUND', message: 'Target not found for this account.' });
                }

                const localDate = formatInTimeZone(now(), getTimezoneForCountry(accountTarget.countryCode), 'yyyy-MM-dd');
                const [change] = await database
                    .select({
                        changedAt: entityChangeHistory.changedAt,
                        previousValue: entityChangeHistory.previousValue,
                        newValue: entityChangeHistory.newValue,
                    })
                    .from(entityChangeHistory)
                    .where(
                        and(
                            eq(entityChangeHistory.accountId, input.accountId),
                            eq(entityChangeHistory.countryCode, accountTarget.countryCode),
                            eq(entityChangeHistory.localDate, localDate),
                            eq(entityChangeHistory.entityType, 'target'),
                            eq(entityChangeHistory.entityId, input.targetId),
                            eq(entityChangeHistory.eventType, 'bid_change')
                        )
                    )
                    .orderBy(desc(entityChangeHistory.changedAt), desc(entityChangeHistory.createdAt), desc(entityChangeHistory.id))
                    .limit(1);

                return change
                    ? {
                          changedAt: change.changedAt.toISOString(),
                          previousValue: change.previousValue,
                          newValue: change.newValue,
                      }
                    : null;
            }),
    });
