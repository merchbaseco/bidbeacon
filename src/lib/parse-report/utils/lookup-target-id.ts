import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { target } from '@/db/schema';

export async function getNormalizedTarget(adGroupId: string, targetValue: string, matchType: string): Promise<{ entityId: string; matchType: string }> {
    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT':
            return getManualKeywordTarget(adGroupId, targetValue, matchType);

        case 'TARGETING_EXPRESSION':
            return getProductTarget(adGroupId, targetValue);

        case 'TARGETING_EXPRESSION_PREDEFINED':
            return getAutoKeywordTarget(adGroupId, targetValue);

        default:
            throw new Error(`Failed to find targetId due to missing matchType`);
    }
}

async function getManualKeywordTarget(adGroupId: string, targetValue: string, matchType: string): Promise<{ entityId: string; matchType: string }> {
    const result = await db.query.target.findFirst({
        where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, targetValue), eq(target.targetMatchType, matchType)),
        columns: { targetId: true },
    });

    if (!result) {
        throw new Error(`Failed to find targetId for targetKeyword: ${targetValue}, matchType: ${matchType}`);
    }

    return {
        entityId: result.targetId,
        matchType,
    };
}

async function getProductTarget(adGroupId: string, targetValue: string): Promise<{ entityId: string; matchType: string }> {
    const targetExportMatchType = targetValue.includes('expanded') ? 'PRODUCT_SIMILAR' : 'PRODUCT_EXACT';
    const asin = parseAsinFromTargetValue(targetValue);

    if (!asin) {
        throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
    }

    const result = await db.query.target.findFirst({
        where: and(eq(target.adGroupId, adGroupId), eq(target.targetAsin, asin), eq(target.targetMatchType, targetExportMatchType)),
        columns: { targetId: true },
    });

    if (!result) {
        throw new Error(`Failed to find targetId for asin: ${asin}, matchType: ${targetExportMatchType}`);
    }

    return {
        entityId: result.targetId,
        matchType: targetExportMatchType,
    };
}

async function getAutoKeywordTarget(adGroupId: string, targetValue: string): Promise<{ entityId: string; matchType: string }> {
    const validPredefinedValues = Object.keys(PREDEFINED_MATCH_TYPE_MAP);
    if (!validPredefinedValues.includes(targetValue)) {
        throw new Error(`Invalid predefined expression value: ${targetValue}. Expected one of: ${validPredefinedValues.join(', ')}`);
    }

    const targetExportMatchType = PREDEFINED_MATCH_TYPE_MAP[targetValue as keyof typeof PREDEFINED_MATCH_TYPE_MAP];
    const result = await db.query.target.findFirst({
        where: and(eq(target.adGroupId, adGroupId), eq(target.targetMatchType, targetExportMatchType), eq(target.targetType, 'AUTO')),
        columns: { targetId: true },
    });

    if (!result) {
        throw new Error(`Failed to find targetId for matchType: ${targetExportMatchType}`);
    }

    return {
        entityId: result.targetId,
        matchType: targetExportMatchType,
    };
}

const PREDEFINED_MATCH_TYPE_MAP = {
    'close-match': 'SEARCH_CLOSE_MATCH',
    'loose-match': 'SEARCH_LOOSE_MATCH',
    substitutes: 'PRODUCT_SUBSTITUTES',
    complements: 'PRODUCT_COMPLEMENTS',
} as const;

function parseAsinFromTargetValue(targetValue: string): string | null {
    const match = targetValue.match(/asin(?:-expanded)?="([^"]+)"/);
    return match?.[1] ?? null;
}
