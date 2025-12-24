import { inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { target } from '@/db/schema';

/**
 * In-memory cache for batch target lookups. Pre-fetches all targets for given
 * adGroupIds and provides fast synchronous lookups by target value and match type.
 */
export class TargetCache {
    private manualKeyword = new Map<string, string>();
    private product = new Map<string, string>();
    private auto = new Map<string, string>();

    private constructor() {}

    static async build(adGroupIds: string[]): Promise<TargetCache> {
        const cache = new TargetCache();

        if (adGroupIds.length === 0) {
            return cache;
        }

        const targets = await db.query.target.findMany({
            where: inArray(target.adGroupId, adGroupIds),
            columns: {
                targetId: true,
                adGroupId: true,
                targetKeyword: true,
                targetAsin: true,
                targetMatchType: true,
                targetType: true,
            },
        });

        for (const t of targets) {
            if (!t.adGroupId) continue;

            // Manual keywords (PHRASE/BROAD/EXACT)
            if (t.targetKeyword && t.targetMatchType) {
                const key = `${t.adGroupId}:${t.targetKeyword}:${t.targetMatchType}`;
                cache.manualKeyword.set(key, t.targetId);
            }

            // Product targets (PRODUCT_EXACT/PRODUCT_SIMILAR)
            if (t.targetAsin && t.targetMatchType) {
                const key = `${t.adGroupId}:${t.targetAsin}:${t.targetMatchType}`;
                cache.product.set(key, t.targetId);
            }

            // Auto targets
            if (t.targetType === 'AUTO' && t.targetMatchType) {
                const key = `${t.adGroupId}:${t.targetMatchType}`;
                cache.auto.set(key, t.targetId);
            }
        }

        return cache;
    }

    getTargetId(adGroupId: string, targetValue: string, matchType: string): string {
        switch (matchType) {
            case 'PHRASE':
            case 'BROAD':
            case 'EXACT': {
                const key = `${adGroupId}:${targetValue}:${matchType}`;
                const targetId = this.manualKeyword.get(key);
                if (!targetId) {
                    throw new Error(`Failed to find targetId for targetKeyword: ${targetValue}, matchType: ${matchType}`);
                }
                return targetId;
            }

            case 'TARGETING_EXPRESSION': {
                const targetExportMatchType = targetValue.includes('expanded') ? 'PRODUCT_SIMILAR' : 'PRODUCT_EXACT';
                const asin = parseAsinFromTargetValue(targetValue);
                if (!asin) {
                    throw new Error(`Could not parse ASIN from targetValue: ${targetValue}`);
                }
                const key = `${adGroupId}:${asin}:${targetExportMatchType}`;
                const targetId = this.product.get(key);
                if (!targetId) {
                    throw new Error(`Failed to find targetId for asin: ${asin}, matchType: ${targetExportMatchType}`);
                }
                return targetId;
            }

            case 'TARGETING_EXPRESSION_PREDEFINED': {
                const validPredefinedValues = Object.keys(PREDEFINED_MATCH_TYPE_MAP);
                if (!validPredefinedValues.includes(targetValue)) {
                    throw new Error(`Invalid predefined expression value: ${targetValue}. Expected one of: ${validPredefinedValues.join(', ')}`);
                }
                const targetExportMatchType = PREDEFINED_MATCH_TYPE_MAP[targetValue as keyof typeof PREDEFINED_MATCH_TYPE_MAP];
                const key = `${adGroupId}:${targetExportMatchType}`;
                const targetId = this.auto.get(key);
                if (!targetId) {
                    throw new Error(`Failed to find targetId for matchType: ${targetExportMatchType}`);
                }
                return targetId;
            }

            default:
                throw new Error(`Failed to find targetId due to missing matchType: ${matchType}`);
        }
    }
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

