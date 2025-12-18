import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { target } from '@/db/schema';
import { createContextLogger } from '@/utils/logger';
import { keepOnlyAscii } from '@/utils/string';

const PREDEFINED_MATCH_TYPE_MAP = {
    'close-match': 'SEARCH_CLOSE_MATCH',
    'loose-match': 'SEARCH_LOOSE_MATCH',
    substitutes: 'PRODUCT_SUBSTITUTES',
    complements: 'PRODUCT_COMPLEMENTS',
} as const;

type PredefinedValue = keyof typeof PREDEFINED_MATCH_TYPE_MAP;

function convertToTargetExportMatchType(matchType: string, targetValue: string): string {
    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT':
            return matchType;

        case 'TARGETING_EXPRESSION':
            return targetValue.includes('expanded') ? 'PRODUCT_SIMILAR' : 'PRODUCT_EXACT';

        case 'TARGETING_EXPRESSION_PREDEFINED': {
            const validPredefinedValues = Object.keys(PREDEFINED_MATCH_TYPE_MAP);
            if (!validPredefinedValues.includes(targetValue)) {
                throw new Error(`Invalid predefined expression value: ${targetValue}. Expected one of: ${validPredefinedValues.join(', ')}`);
            }
            return PREDEFINED_MATCH_TYPE_MAP[targetValue as PredefinedValue];
        }

        default:
            throw new Error(`Failed to convert target ${matchType} in convertToTargetExportMatchType. targetValue: ${targetValue}`);
    }
}

function parseAsinFromTargetValue(targetValue: string): string | null {
    const match = targetValue.match(/asin(?:-expanded)?="([^"]+)"/);
    return match?.[1] ?? null;
}

export async function lookupTargetId(row: {
    'adGroup.id': string;
    'target.value': string;
    'target.matchType': string;
    'searchTerm.value': string;
}): Promise<{ entityType: string; entityId: string; matchType: string | undefined }> {
    const adGroupId = row['adGroup.id'];
    const targetValue = row['target.value'];
    const matchType = row['target.matchType'];
    const matchedTargetValue = keepOnlyAscii(row['searchTerm.value']);

    const logger = createContextLogger({ component: 'parse-report', utility: 'lookup-target-id' });

    if (!targetValue || !matchType) {
        if (!matchedTargetValue) {
            logger.error({ adGroupId, matchedTargetValue, row }, 'Failed to find target (fallback mode - all values empty)');
            throw new Error(
                `Could not find target for adGroupId: ${adGroupId}, matchedTargetValue: ${matchedTargetValue} (fallback mode - target.value and target.matchType were empty, but searchTerm.value is also empty)`
            );
        }

        const result = await db.query.target.findFirst({
            where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, matchedTargetValue), eq(target.targetMatchType, 'EXACT')),
            columns: { targetId: true },
        });

        if (!result) {
            logger.error({ adGroupId, matchedTargetValue, row }, 'Failed to find target (fallback mode)');
            throw new Error(`Could not find target for adGroupId: ${adGroupId}, matchedTargetValue: ${matchedTargetValue} (fallback mode - target.value and target.matchType were empty)`);
        }

        return {
            entityType: matchedTargetValue,
            entityId: result.targetId,
            matchType: 'EXACT',
        };
    }

    const targetExportMatchType = convertToTargetExportMatchType(matchType, targetValue);

    switch (matchType) {
        case 'PHRASE':
        case 'BROAD':
        case 'EXACT': {
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetKeyword, targetValue), eq(target.targetMatchType, targetExportMatchType)),
                columns: { targetId: true },
            });

            if (!result) {
                logger.error({ adGroupId, targetValue, matchType, targetExportMatchType, row }, 'Failed to find target (PHRASE/BROAD/EXACT)');
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, targetValue: ${targetValue}, matchType: ${matchType} (converted: ${targetExportMatchType})`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        case 'TARGETING_EXPRESSION': {
            const asin = parseAsinFromTargetValue(targetValue);

            if (!asin) {
                logger.error({ adGroupId, targetValue, row }, 'Failed to parse ASIN from targetValue');
                throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
            }

            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetAsin, asin), eq(target.targetMatchType, targetExportMatchType)),
                columns: { targetId: true },
            });

            if (!result) {
                logger.error({ adGroupId, asin, matchType, targetExportMatchType, row }, 'Failed to find target (TARGETING_EXPRESSION)');
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, asin: ${asin}, matchType: ${matchType} (converted: ${targetExportMatchType})`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        case 'TARGETING_EXPRESSION_PREDEFINED': {
            const result = await db.query.target.findFirst({
                where: and(eq(target.adGroupId, adGroupId), eq(target.targetMatchType, targetExportMatchType), eq(target.targetType, 'AUTO')),
                columns: { targetId: true },
            });

            if (!result) {
                logger.error({ adGroupId, matchType, targetExportMatchType, row }, 'Failed to find target (TARGETING_EXPRESSION_PREDEFINED)');
                throw new Error(`Could not find target for adGroupId: ${adGroupId}, matchType: ${matchType} (converted: ${targetExportMatchType}), targetType: AUTO`);
            }

            return {
                entityType: targetValue,
                entityId: result.targetId,
                matchType: targetExportMatchType,
            };
        }

        default:
            logger.error({ adGroupId, matchType, row }, 'Unknown matchType');
            throw new Error(`Failed to find targetId for matchType: ${matchType}`);
    }
}
