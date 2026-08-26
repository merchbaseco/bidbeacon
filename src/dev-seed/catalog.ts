/**
 * The fabricated advertiser's vocabulary. One outdoor-gear brand, because a
 * coherent catalog makes the dashboard read like a real account: campaign names
 * that group, keywords that plausibly belong to the products they target, and
 * ASINs that recur across ads and product targets.
 *
 * Nothing here is fetched or provider-shaped. These are literals the seed turns
 * into local rows; the seed never calls Amazon.
 */

export const SEED_BRAND = 'Cedar & Coil';

export interface SeedProduct {
    asin: string;
    /** Retail price, which the seed also uses as attributed revenue per unit. */
    price: number;
    /** Relative share of the account's demand. */
    share: number;
    theme: string;
    title: string;
}

export const SEED_PRODUCTS: readonly SeedProduct[] = [
    { asin: 'B0DEV5EED01', price: 42.99, share: 1, theme: 'Trail Runner Belt', title: `${SEED_BRAND} Trail Runner Hydration Belt` },
    { asin: 'B0DEV5EED02', price: 28.5, share: 0.74, theme: 'Merino Socks', title: `${SEED_BRAND} Merino Wool Hiking Socks, 3-Pack` },
    { asin: 'B0DEV5EED03', price: 64.0, share: 0.61, theme: 'Packable Rain Shell', title: `${SEED_BRAND} Packable Rain Shell, Unisex` },
    { asin: 'B0DEV5EED04', price: 19.95, share: 0.48, theme: 'Camp Mug', title: `${SEED_BRAND} Enamel Camp Mug, 16 oz` },
    { asin: 'B0DEV5EED05', price: 89.0, share: 0.4, theme: 'Down Quilt', title: `${SEED_BRAND} Ultralight Down Camp Quilt` },
    { asin: 'B0DEV5EED06', price: 34.25, share: 0.31, theme: 'Headlamp', title: `${SEED_BRAND} Rechargeable Trail Headlamp` },
    { asin: 'B0DEV5EED07', price: 52.0, share: 0.22, theme: 'Trekking Poles', title: `${SEED_BRAND} Carbon Trekking Poles, Pair` },
    { asin: 'B0DEV5EED08', price: 24.99, share: 0.16, theme: 'Dry Bag', title: `${SEED_BRAND} Roll-Top Dry Bag, 10 L` },
];

/** Keyword phrases per product theme, roughly ordered head to long tail. */
export const SEED_KEYWORDS: Record<string, readonly string[]> = {
    'Camp Mug': ['enamel camp mug', 'camping coffee mug', 'insulated camp cup', 'speckled enamel mug 16 oz'],
    'Down Quilt': ['ultralight camping quilt', 'down quilt backpacking', '20 degree camp quilt', 'lightweight sleeping quilt'],
    'Dry Bag': ['roll top dry bag', 'waterproof dry sack', 'kayak dry bag 10l', 'dry bag for hiking'],
    Headlamp: ['rechargeable headlamp', 'usb headlamp camping', 'red light headlamp', 'headlamp for running at night'],
    'Merino Socks': ['merino wool socks', 'hiking socks men', 'wool crew socks 3 pack', 'no blister hiking socks'],
    'Packable Rain Shell': ['packable rain jacket', 'lightweight rain shell', 'waterproof windbreaker', 'rain jacket for hiking'],
    'Trail Runner Belt': ['running hydration belt', 'trail running belt', 'water bottle running belt', 'hydration belt with phone pocket'],
    'Trekking Poles': ['carbon trekking poles', 'collapsible hiking poles', 'trekking poles pair', 'lightweight walking poles'],
};

/** Negative keywords, deliberately shared across campaigns like a real account. */
export const SEED_NEGATIVE_KEYWORDS: readonly string[] = ['free', 'used', 'wholesale', 'kids', 'replacement parts', 'rental'];

/** Match types for auto targeting groups, in Amazon's own vocabulary. */
export const SEED_AUTO_MATCH_TYPES: readonly string[] = ['QUERY_HIGH_REL_MATCHES', 'QUERY_BROAD_REL_MATCHES', 'ASIN_SUBSTITUTE_RELATED', 'ASIN_ACCESSORY_RELATED'];

export const SEED_KEYWORD_MATCH_TYPES: readonly string[] = ['EXACT', 'PHRASE', 'BROAD'];

/** Competitor ASINs the account targets, which never appear as its own ads. */
export const SEED_COMPETITOR_ASINS: readonly string[] = ['B0CMPT5EED1', 'B0CMPT5EED2', 'B0CMPT5EED3', 'B0CMPT5EED4'];

export const SEED_BID_STRATEGIES: readonly string[] = ['LEGACY_FOR_SALES', 'AUTO_FOR_SALES', 'MANUAL'];
