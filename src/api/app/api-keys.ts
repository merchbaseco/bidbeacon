import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { apiKey, apiKeyAccountAccess } from '@/db/schema';
import { privateProcedure, router } from '../trpc';

const API_KEY_PREFIX = 'bbk';
const API_KEY_SECRET_BYTES = 32;
const API_KEY_SUFFIX_LENGTH = 6;

export const apiKeysRouter = router({
    list: privateProcedure.query(async ({ ctx }) => {
        const keys = await db
            .select({
                id: apiKey.id,
                label: apiKey.label,
                secretSuffix: apiKey.secretSuffix,
                createdAt: apiKey.createdAt,
                lastUsedAt: apiKey.lastUsedAt,
            })
            .from(apiKey)
            .where(eq(apiKey.createdBy, ctx.user.sub));

        const keyIds = keys.map(key => key.id);
        const accessRows = keyIds.length
            ? await db
                  .select({
                      apiKeyId: apiKeyAccountAccess.apiKeyId,
                      adsAccountId: apiKeyAccountAccess.adsAccountId,
                  })
                  .from(apiKeyAccountAccess)
                  .where(inArray(apiKeyAccountAccess.apiKeyId, keyIds))
            : [];

        const accessMap = new Map<string, string[]>();
        for (const row of accessRows) {
            const current = accessMap.get(row.apiKeyId) ?? [];
            current.push(row.adsAccountId);
            accessMap.set(row.apiKeyId, current);
        }

        return keys.map(key => ({
            ...key,
            accountIds: accessMap.get(key.id) ?? [],
        }));
    }),

    create: privateProcedure
        .input(
            z.object({
                label: z.string().trim().min(1),
                adsAccountIds: z.array(z.string().trim().min(1)).default([]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const accountIds = dedupeAccounts(input.adsAccountIds);
            const invalidAccountIds = accountIds.filter(accountId => !ctx.accessibleAccountIds.includes(accountId));
            if (invalidAccountIds.length > 0) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to one or more accounts' });
            }

            const apiKeyId = randomUUID();
            const secret = generateApiKeySecret();
            const token = buildApiKeyToken(apiKeyId, secret);

            await db.transaction(async tx => {
                await tx.delete(apiKey).where(eq(apiKey.createdBy, ctx.user.sub));

                await tx.insert(apiKey).values({
                    id: apiKeyId,
                    label: input.label,
                    secretHash: hashApiKeySecret(secret),
                    secretSuffix: secret.slice(-API_KEY_SUFFIX_LENGTH),
                    createdBy: ctx.user.sub,
                });

                if (accountIds.length > 0) {
                    await tx.insert(apiKeyAccountAccess).values(
                        accountIds.map(accountId => ({
                            apiKeyId,
                            adsAccountId: accountId,
                        }))
                    );
                }
            });

            return {
                apiKey: token,
                apiKeyId,
                label: input.label,
                secretSuffix: secret.slice(-API_KEY_SUFFIX_LENGTH),
                accountIds,
            };
        }),

    revoke: privateProcedure
        .input(
            z.object({
                apiKeyId: z.string().uuid(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const record = await db.query.apiKey.findFirst({
                where: and(eq(apiKey.id, input.apiKeyId), eq(apiKey.createdBy, ctx.user.sub)),
            });

            if (!record) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
            }

            await db.delete(apiKey).where(eq(apiKey.id, input.apiKeyId));

            return true;
        }),
});

// ============================================================================
// Helpers
// ============================================================================

const dedupeAccounts = (accountIds: string[]) => {
    const unique = new Set(accountIds.map(accountId => accountId.trim()).filter(Boolean));
    return Array.from(unique);
};

const generateApiKeySecret = () => randomBytes(API_KEY_SECRET_BYTES).toString('hex');

const buildApiKeyToken = (apiKeyId: string, secret: string) => `${API_KEY_PREFIX}_${apiKeyId}_${secret}`;

const hashApiKeySecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
