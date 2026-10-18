export const PLACEMENT_KEYS = ['topOfSearch', 'restOfSearch', 'productPages', 'amazonBusiness'] as const;

export type PlacementKey = (typeof PLACEMENT_KEYS)[number];

export type PlacementBidAdjustments = Partial<Record<PlacementKey, number>>;

export type PlacementResolution = { present: false } | { present: true; value: PlacementBidAdjustments };

export type PlacementPersistence = { mode: 'replace'; value: PlacementBidAdjustments } | { mode: 'preserve' };

export const parsePlacementBidAdjustments = (value: unknown): PlacementResolution => {
    if (Array.isArray(value)) {
        return { present: true, value: placementsFromArray(value) };
    }
    if (!isRecord(value)) {
        return value === undefined ? { present: false } : { present: true, value: {} };
    }

    const directPresent = Object.hasOwn(value, 'placementBidAdjustments');
    const nested = nestedPlacementBidAdjustments(value);
    if (directPresent || nested.present) {
        const source = directPresent ? value.placementBidAdjustments : nested.value;
        if (Array.isArray(source)) {
            return { present: true, value: placementsFromArray(source) };
        }
        if (!isRecord(source)) {
            return { present: true, value: {} };
        }
        return { present: true, value: placementsFromObject(source) };
    }

    if (!hasPlacementAlias(value)) {
        return { present: false };
    }
    return { present: true, value: placementsFromObject(value) };
};

export const placementFromExportOptimization = (optimization: unknown): PlacementBidAdjustments => {
    if (!isRecord(optimization)) {
        return {};
    }
    if (Object.hasOwn(optimization, 'placementBidAdjustments')) {
        const parsed = parsePlacementBidAdjustments(optimization.placementBidAdjustments);
        return parsed.present ? parsed.value : {};
    }
    const parsed = parsePlacementBidAdjustments(optimization);
    return parsed.present ? parsed.value : {};
};

export const readStoredPlacementBidAdjustments = (value: unknown): PlacementBidAdjustments | null => {
    if (!isRecord(value)) {
        return null;
    }
    return placementsFromObject(value);
};

export const toAmazonPlacementBidAdjustments = (adjustments: PlacementBidAdjustments | undefined) => {
    if (!adjustments) {
        return undefined;
    }

    return Object.entries(adjustments).flatMap(([key, percentage]) => {
        if (!isPlacementKey(key) || typeof percentage !== 'number') {
            return [];
        }
        return [{ percentage, placement: AMAZON_PLACEMENT_KEYS[key] }];
    });
};

export const placementWrite = (input: { resolution: PlacementResolution; requested: PlacementBidAdjustments | undefined; stored: PlacementBidAdjustments | null }): PlacementPersistence => {
    if (input.resolution.present) {
        return { mode: 'replace', value: input.resolution.value };
    }
    if (input.requested === undefined) {
        return { mode: 'preserve' };
    }
    return { mode: 'replace', value: mergePlacementBidAdjustments(input.stored, input.requested) };
};

const AMAZON_PLACEMENT_KEYS = {
    amazonBusiness: 'AMAZON_BUSINESS',
    productPages: 'PRODUCT_PAGE',
    restOfSearch: 'REST_OF_SEARCH',
    topOfSearch: 'TOP_OF_SEARCH',
} as const satisfies Record<PlacementKey, string>;

const PUBLIC_PLACEMENT_KEYS = {
    AMAZON_BUSINESS: 'amazonBusiness',
    PLACEMENT_AMAZON_BUSINESS: 'amazonBusiness',
    PLACEMENT_PRODUCT_PAGE: 'productPages',
    PLACEMENT_REST_OF_SEARCH: 'restOfSearch',
    PLACEMENT_TOP: 'topOfSearch',
    PLACEMENT_TOP_OF_SEARCH: 'topOfSearch',
    PRODUCT_PAGE: 'productPages',
    REST_OF_SEARCH: 'restOfSearch',
    TOP_OF_SEARCH: 'topOfSearch',
    placementAmazonBusiness: 'amazonBusiness',
    placementProductPage: 'productPages',
    placementRestOfSearch: 'restOfSearch',
    placementTop: 'topOfSearch',
    productPage: 'productPages',
} as const satisfies Record<string, PlacementKey>;

const OBJECT_ALIAS_ORDER = {
    topOfSearch: ['topOfSearch', 'placementTop', 'TOP_OF_SEARCH', 'PLACEMENT_TOP', 'PLACEMENT_TOP_OF_SEARCH'],
    restOfSearch: ['restOfSearch', 'placementRestOfSearch', 'REST_OF_SEARCH', 'PLACEMENT_REST_OF_SEARCH'],
    productPages: ['productPages', 'productPage', 'placementProductPage', 'PRODUCT_PAGE', 'PLACEMENT_PRODUCT_PAGE'],
    amazonBusiness: ['amazonBusiness', 'placementAmazonBusiness', 'AMAZON_BUSINESS', 'PLACEMENT_AMAZON_BUSINESS'],
} as const satisfies Record<PlacementKey, readonly string[]>;

const placementsFromArray = (source: unknown[]): PlacementBidAdjustments => {
    const collected: PlacementBidAdjustments = {};
    for (const value of source) {
        if (!isRecord(value)) {
            continue;
        }
        const placement = readString(value.placement) ?? readString(value.predicate);
        const key = placement ? PUBLIC_PLACEMENT_KEYS[placement as keyof typeof PUBLIC_PLACEMENT_KEYS] : undefined;
        if (!key) {
            continue;
        }
        const percentage = storedPercent(parsePlacementValue(value.percentage));
        if (percentage === undefined) {
            continue;
        }
        collected[key] = percentage;
    }
    return compact(collected);
};

const placementsFromObject = (value: Record<string, unknown>): PlacementBidAdjustments => {
    const collected: PlacementBidAdjustments = {};
    for (const key of PLACEMENT_KEYS) {
        const percentage = firstStoredPercent(value, OBJECT_ALIAS_ORDER[key]);
        if (percentage === undefined) {
            continue;
        }
        collected[key] = percentage;
    }
    return compact(collected);
};

const firstStoredPercent = (value: Record<string, unknown>, aliases: readonly string[]) => {
    for (const alias of aliases) {
        if (!Object.hasOwn(value, alias) || value[alias] === null || value[alias] === undefined) {
            continue;
        }
        return storedPercent(parsePlacementValue(value[alias]));
    }
    return undefined;
};

const hasPlacementAlias = (value: Record<string, unknown>) => PLACEMENT_KEYS.some(key => OBJECT_ALIAS_ORDER[key].some(alias => Object.hasOwn(value, alias)));

const nestedPlacementBidAdjustments = (record: Record<string, unknown>) => {
    const optimizations = record.optimizations;
    const bidSettings = isRecord(optimizations) ? optimizations.bidSettings : undefined;
    const bidAdjustments = isRecord(bidSettings) ? bidSettings.bidAdjustments : undefined;
    if (!(isRecord(bidAdjustments) && Object.hasOwn(bidAdjustments, 'placementBidAdjustments'))) {
        return { present: false as const, value: undefined };
    }
    return { present: true as const, value: bidAdjustments.placementBidAdjustments };
};

const mergePlacementBidAdjustments = (stored: PlacementBidAdjustments | null, requested: PlacementBidAdjustments) => compact({ ...stored, ...requested });

const compact = (value: PlacementBidAdjustments): PlacementBidAdjustments => {
    const result: PlacementBidAdjustments = {};
    for (const key of PLACEMENT_KEYS) {
        const percentage = storedPercent(value[key]);
        if (percentage === undefined) {
            continue;
        }
        result[key] = percentage;
    }
    return result;
};

const storedPercent = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 900) {
        return undefined;
    }
    return value;
};

const parsePlacementValue = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const readString = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : undefined);

const isPlacementKey = (value: string): value is PlacementKey => PLACEMENT_KEYS.some(key => key === value);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
