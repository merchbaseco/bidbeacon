import { TRPCError } from '@trpc/server';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';

export const getPagination = (limit?: number, cursor?: string) => {
    const resolvedLimit = limit ?? 50;
    const offset = cursor ? Number(cursor) : 0;

    if (!Number.isFinite(offset) || offset < 0) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'cursor must be a non-negative number string.',
        });
    }

    return { limit: resolvedLimit, offset };
};

export const formatListResponse = <Row, Output>(rows: Row[], offset: number, limit: number, formatter: (row: Row) => Output) => {
    const sliced = rows.length > limit ? rows.slice(0, limit) : rows;
    const hasMore = rows.length > limit;

    return {
        rows: sliced.map(row => formatter(row)),
        nextCursor: hasMore ? String(offset + limit) : null,
    };
};

export const parseNumeric = (value: string | number | null) => {
    if (value === null || value === undefined) return null;
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

export const formatDate = (value: string | Date | null) => {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    return value;
};

export const formatDateTime = (value: Date | string | null) => {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value;
};

export const toMoneyString = (value: number) => value.toFixed(2);

export const isSponsoredProducts = (adProduct: string | null) => {
    if (!adProduct) return false;
    const normalized = adProduct.toUpperCase();
    return normalized === 'SPONSORED_PRODUCTS' || normalized === 'SP';
};

export const resolveProfileId = async (accountId: string | null, countryCode: string | null) => {
    if (!accountId) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing account id for this entity.',
        });
    }

    if (!countryCode) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing country code for this entity.',
        });
    }

    const advertiser = await db.query.advertiserAccount.findFirst({
        where: (table, { and, eq }) => and(eq(table.adsAccountId, accountId), eq(table.countryCode, countryCode)),
    });

    if (!advertiser?.profileId) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing Amazon Ads profile for this account/country.',
        });
    }

    const profileId = Number(advertiser.profileId);

    if (!Number.isFinite(profileId)) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Amazon Ads profile id is invalid.',
        });
    }

    return profileId;
};
