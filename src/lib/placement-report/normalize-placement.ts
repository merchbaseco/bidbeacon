export const PLACEMENT_VALUES = ['TOP_OF_SEARCH', 'REST_OF_SEARCH', 'PRODUCT_PAGE', 'AMAZON_BUSINESS'] as const;

export type Placement = (typeof PLACEMENT_VALUES)[number];

const SOURCE_PLACEMENT_ALIASES: Readonly<Record<string, Placement>> = {
    AMAZON_BUSINESS: 'AMAZON_BUSINESS',
    AMAZON_BUSINESS_PLACEMENT: 'AMAZON_BUSINESS',
    OTHER_ON_AMAZON: 'REST_OF_SEARCH',
    OTHER_ON_AMAZON_PLACEMENTS: 'REST_OF_SEARCH',
    PRODUCT_DETAIL_PAGE: 'PRODUCT_PAGE',
    PRODUCT_DETAIL_PAGES: 'PRODUCT_PAGE',
    PRODUCT_PAGE: 'PRODUCT_PAGE',
    PRODUCT_PAGES: 'PRODUCT_PAGE',
    REST_OF_SEARCH: 'REST_OF_SEARCH',
    REST_OF_SEARCH_PLACEMENT: 'REST_OF_SEARCH',
    TOP_OF_SEARCH: 'TOP_OF_SEARCH',
    TOP_OF_SEARCH_FIRST_PAGE: 'TOP_OF_SEARCH',
    TOP_OF_SEARCH_PLACEMENT: 'TOP_OF_SEARCH',
    SITE_AMAZON_BUSINESS: 'AMAZON_BUSINESS',
};

export const normalizePlacement = (sourceValue: unknown): Placement => {
    const sourceLabel = typeof sourceValue === 'string' ? sourceValue : String(sourceValue);
    const normalized = sourceLabel
        .trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase();
    const placement = SOURCE_PLACEMENT_ALIASES[normalized];

    if (!placement) {
        throw new Error(`Unknown placement source value: ${sourceLabel}`);
    }

    return placement;
};

export const isPlacement = (value: unknown): value is Placement => typeof value === 'string' && (PLACEMENT_VALUES as readonly string[]).includes(value);
