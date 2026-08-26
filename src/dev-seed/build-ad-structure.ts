import { formatInTimeZone } from 'date-fns-tz';
import { SEED_AUTO_MATCH_TYPES, SEED_BID_STRATEGIES, SEED_COMPETITOR_ASINS, SEED_KEYWORD_MATCH_TYPES, SEED_KEYWORDS, SEED_NEGATIVE_KEYWORDS, SEED_PRODUCTS } from './catalog';
import type { SeededRandom } from './random';
import type { SeedAdStructure, SeedTarget } from './types';

/**
 * The advertiser's ad structure: campaigns, their ad groups, the product ads
 * inside them, and the keyword, product, auto, and negative targets underneath.
 *
 * The structure is what every list, search, and entity-detail surface reads, so
 * it deliberately covers the shapes those surfaces branch on — an auto campaign
 * beside manual ones, a paused campaign, one campaign out of budget, negatives
 * that must never accrue spend, and a target of each type.
 */

const AD_PRODUCT = 'SPONSORED_PRODUCTS';
const CAMPAIGN_KINDS = ['AUTO', 'KEYWORD', 'PRODUCT'] as const;
const KIND_LABELS: Record<(typeof CAMPAIGN_KINDS)[number], string> = { AUTO: 'Auto', KEYWORD: 'KW', PRODUCT: 'PT' };
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export const buildAdStructure = (input: { accountId: string; campaignCount: number; countryCode: string; now: Date; random: SeededRandom; timezone: string }): SeedAdStructure => {
    const structure: SeedAdStructure = { adGroups: [], ads: [], campaigns: [], servingTargets: [], targets: [] };

    for (let index = 0; index < input.campaignCount; index += 1) {
        const product = SEED_PRODUCTS[index % SEED_PRODUCTS.length];
        const kind = CAMPAIGN_KINDS[index % CAMPAIGN_KINDS.length];
        if (!product) {
            continue;
        }

        // One paused campaign and one that ran out of budget, so the state and
        // delivery chips are never all the same colour.
        const paused = index === input.campaignCount - 1;
        const outOfBudget = index === 1;
        const campaignId = buildEntityId(input.random);
        const startedDaysAgo = input.random.int(45, 220);
        const createdAt = shiftDays(input.now, -startedDaysAgo);

        structure.campaigns.push({
            accountId: input.accountId,
            adProduct: AD_PRODUCT,
            bidStrategy: input.random.pick(SEED_BID_STRATEGIES),
            budgetAmount: (Math.round(input.random.between(18, 140) * 100) / 100).toFixed(2),
            budgetPeriod: 'DAILY',
            budgetType: 'DAILY',
            campaignId,
            countryCode: input.countryCode,
            creationDateTime: createdAt,
            deliveryStatus: paused ? 'PAUSED' : outOfBudget ? 'OUT_OF_BUDGET' : 'DELIVERING',
            endDate: index === 2 ? formatInTimeZone(shiftDays(input.now, 45), input.timezone, 'yyyy-MM-dd') : null,
            id: campaignId,
            lastUpdatedDateTime: shiftDays(input.now, -input.random.int(0, 6)),
            name: `SP - ${product.theme} - ${KIND_LABELS[kind]}`,
            startDate: formatInTimeZone(createdAt, input.timezone, 'yyyy-MM-dd'),
            state: paused ? 'PAUSED' : 'ENABLED',
            targetingSettings: kind === 'AUTO' ? 'AUTO' : 'MANUAL',
        });

        const adGroupNames = kind === 'AUTO' ? ['Auto Discovery'] : ['Core', 'Expansion'];
        for (const [groupIndex, groupName] of adGroupNames.entries()) {
            const adGroupId = buildEntityId(input.random);
            const defaultBid = Math.round(input.random.between(0.42, 1.85) * 100) / 100;
            const groupPaused = paused || (kind === 'KEYWORD' && groupIndex === 1 && index === 0);

            structure.adGroups.push({
                adGroupId,
                adProduct: AD_PRODUCT,
                bidAmount: defaultBid.toFixed(2),
                campaignId,
                creationDateTime: createdAt,
                deliveryStatus: groupPaused ? 'PAUSED' : 'DELIVERING',
                id: adGroupId,
                lastUpdatedDateTime: shiftDays(input.now, -input.random.int(0, 9)),
                name: `${product.theme} - ${groupName}`,
                state: groupPaused ? 'PAUSED' : 'ENABLED',
            });

            // The expansion group advertises a neighbouring product too, so the
            // ad dimension is not a one-to-one restatement of its ad group.
            const advertised = groupIndex === 0 ? [product] : [product, SEED_PRODUCTS[(index + 1) % SEED_PRODUCTS.length] ?? product];
            const adIds = advertised.map(advertisedProduct => {
                const adId = buildEntityId(input.random);
                structure.ads.push({
                    adGroupId,
                    adId,
                    adProduct: AD_PRODUCT,
                    adType: 'PRODUCT_AD',
                    campaignId,
                    creationDateTime: createdAt,
                    deliveryStatus: groupPaused ? 'PAUSED' : 'DELIVERING',
                    id: adId,
                    lastUpdatedDateTime: shiftDays(input.now, -input.random.int(0, 12)),
                    productAsin: advertisedProduct.asin,
                    state: groupPaused ? 'PAUSED' : 'ENABLED',
                });
                return adId;
            });

            const targets = buildTargetsForAdGroup({ adGroupId, adIds, campaignId, defaultBid, groupIndex, kind, product, random: input.random });
            for (const built of targets) {
                structure.targets.push({
                    adGroupId,
                    adProduct: AD_PRODUCT,
                    bidAmount: built.negative ? null : built.bidAmount.toFixed(2),
                    campaignId,
                    creationDateTime: createdAt,
                    deliveryStatus: built.state === 'ENABLED' && !groupPaused ? 'DELIVERING' : 'PAUSED',
                    id: built.targetId,
                    lastUpdatedDateTime: shiftDays(input.now, -input.random.int(0, 10)),
                    negative: built.negative,
                    state: built.state,
                    targetAsin: built.targetAsin,
                    targetId: built.targetId,
                    targetKeyword: built.targetKeyword,
                    targetMatchType: built.targetMatchType,
                    targetType: built.targetType,
                });

                if (!(built.negative || groupPaused || built.state !== 'ENABLED')) {
                    structure.servingTargets.push(built.serving);
                }
            }
        }
    }

    return structure;
};

/** Amazon hands out opaque numeric ids; the seed mints ones that look the part. */
const buildEntityId = (random: SeededRandom) => String(random.int(100_000_000_000, 999_999_999_999));

const shiftDays = (from: Date, days: number) => new Date(from.getTime() + days * DAY_MS);

interface BuiltTarget {
    bidAmount: number;
    negative: boolean;
    serving: SeedTarget;
    state: string;
    targetAsin: string | null;
    targetId: string;
    targetKeyword: string | null;
    targetMatchType: string | null;
    targetType: string;
}

const buildTargetsForAdGroup = (input: {
    adGroupId: string;
    adIds: string[];
    campaignId: string;
    defaultBid: number;
    groupIndex: number;
    kind: (typeof CAMPAIGN_KINDS)[number];
    product: (typeof SEED_PRODUCTS)[number];
    random: SeededRandom;
}): BuiltTarget[] => {
    const built: BuiltTarget[] = [];
    const keywords = SEED_KEYWORDS[input.product.theme] ?? [];

    const push = (draft: Omit<BuiltTarget, 'serving' | 'bidAmount'> & { bidAmount: number; rank: number }) => {
        // Traffic rotates through the group's ads so every ad dimension row has
        // performance behind it, not just the first one.
        const adId = input.adIds[built.length % input.adIds.length] ?? input.adIds[0] ?? '';
        built.push({
            ...draft,
            serving: {
                adGroupId: input.adGroupId,
                adId,
                bidAmount: draft.bidAmount,
                campaignId: input.campaignId,
                conversionRate: Math.round(input.random.between(0.03, 0.16) * 1000) / 1000,
                negative: draft.negative,
                salesWeight: input.product.share * Math.exp(-draft.rank * 0.35) * input.random.between(0.65, 1.35) * (input.groupIndex === 0 ? 1 : 0.55),
                startDayOffset: input.random.int(20, 120),
                state: draft.state,
                targetId: draft.targetId,
                unitPrice: input.product.price,
            },
        });
    };

    if (input.kind === 'AUTO') {
        for (const [rank, matchType] of SEED_AUTO_MATCH_TYPES.entries()) {
            push({
                bidAmount: Math.round(input.defaultBid * input.random.between(0.8, 1.3) * 100) / 100,
                negative: false,
                rank,
                state: 'ENABLED',
                targetAsin: null,
                targetId: buildEntityId(input.random),
                targetKeyword: null,
                targetMatchType: matchType,
                targetType: 'AUTO',
            });
        }
    }

    if (input.kind === 'KEYWORD') {
        const selected = keywords.slice(0, input.groupIndex === 0 ? 3 : keywords.length);
        for (const [keywordIndex, keyword] of selected.entries()) {
            const matchType = SEED_KEYWORD_MATCH_TYPES[(keywordIndex + input.groupIndex) % SEED_KEYWORD_MATCH_TYPES.length] ?? 'EXACT';
            // One keyword per account is paused, so the state filter has
            // something to filter.
            const paused = input.groupIndex === 1 && keywordIndex === selected.length - 1;
            push({
                bidAmount: Math.round(input.defaultBid * input.random.between(0.7, 1.6) * 100) / 100,
                negative: false,
                rank: keywordIndex,
                state: paused ? 'PAUSED' : 'ENABLED',
                targetAsin: null,
                targetId: buildEntityId(input.random),
                targetKeyword: keyword,
                targetMatchType: matchType,
                targetType: 'KEYWORD',
            });
        }
    }

    if (input.kind === 'PRODUCT') {
        const asins = input.groupIndex === 0 ? SEED_COMPETITOR_ASINS.slice(0, 2) : SEED_COMPETITOR_ASINS.slice(2);
        for (const [asinIndex, asin] of asins.entries()) {
            push({
                bidAmount: Math.round(input.defaultBid * input.random.between(0.6, 1.2) * 100) / 100,
                negative: false,
                rank: asinIndex,
                state: 'ENABLED',
                targetAsin: asin,
                targetId: buildEntityId(input.random),
                targetKeyword: null,
                targetMatchType: 'PRODUCT_EXACT',
                targetType: 'PRODUCT',
            });
        }
    }

    // Negatives exist on every ad group and must never accrue spend: they are
    // built here but excluded from the serving set the performance builder reads.
    if (input.groupIndex === 0) {
        for (const [negativeIndex, keyword] of SEED_NEGATIVE_KEYWORDS.slice(0, 2).entries()) {
            push({
                bidAmount: 0,
                negative: true,
                rank: negativeIndex,
                state: 'ENABLED',
                targetAsin: null,
                targetId: buildEntityId(input.random),
                targetKeyword: keyword,
                targetMatchType: negativeIndex === 0 ? 'NEGATIVE_EXACT' : 'NEGATIVE_PHRASE',
                targetType: 'KEYWORD',
            });
        }
    }

    return built;
};
