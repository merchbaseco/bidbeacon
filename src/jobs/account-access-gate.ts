import { ServiceAccessError } from '@merchbaseco/access';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';
import { getBidBeaconAccess } from '@/services/access/bidbeacon-access';

export type AccountAccessGateReason = 'allowed' | 'access_denied' | 'access_unavailable' | 'no_current_members';

export type AccountAccessGateResult = { allowed: true; reason: 'allowed' } | { allowed: false; reason: Exclude<AccountAccessGateReason, 'allowed'> };

export type AccountAccessEvaluator = {
    evaluateAccess: (merchbaseUserId: string) => Promise<unknown>;
};

export const evaluateAccountAccess = async (input: { evaluateAccess: AccountAccessEvaluator['evaluateAccess']; memberships: Array<{ merchbaseUserId: string }> }): Promise<AccountAccessGateResult> => {
    if (input.memberships.length === 0) {
        return { allowed: false, reason: 'no_current_members' };
    }

    let unavailable = false;
    for (const membership of input.memberships) {
        try {
            await input.evaluateAccess(membership.merchbaseUserId);
            return { allowed: true, reason: 'allowed' };
        } catch (error) {
            if (error instanceof ServiceAccessError && error.code === 'access_denied') {
                continue;
            }
            unavailable = true;
        }
    }

    return {
        allowed: false,
        reason: unavailable ? 'access_unavailable' : 'access_denied',
    };
};

export const hasCurrentAccountAccess = async (accountId: string): Promise<AccountAccessGateResult> => {
    try {
        const memberships = await db.select({ merchbaseUserId: userAccountAccess.merchbaseUserId }).from(userAccountAccess).where(eq(userAccountAccess.adsAccountId, accountId));

        return evaluateAccountAccess({
            evaluateAccess: merchbaseUserId => getBidBeaconAccess().sessionAccess.evaluateAccess(merchbaseUserId),
            memberships,
        });
    } catch {
        return { allowed: false, reason: 'access_unavailable' };
    }
};

export const recordAccessGateSkip = (input: {
    accountId: string;
    countryCode: string;
    reason: Exclude<AccountAccessGateReason, 'allowed'>;
    recorder: { addEvent: (event: { message: string; payload: Record<string, unknown> }) => void };
}) => {
    input.recorder.addEvent({
        message: 'Skipped advertiser-account work because current Merchbase Access was unavailable or denied.',
        payload: {
            accountId: input.accountId,
            countryCode: input.countryCode,
            reason: input.reason,
        },
    });
};

export const gateAccountWork = async (input: { accountId: string; countryCode: string; recorder: { addEvent: (event: { message: string; payload: Record<string, unknown> }) => void } }) => {
    const result = await hasCurrentAccountAccess(input.accountId);
    if (!result.allowed) {
        recordAccessGateSkip({ ...input, reason: result.reason });
        return false;
    }

    return true;
};
