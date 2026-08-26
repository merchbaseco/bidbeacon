/**
 * Deterministic UUIDs for the seeded rows that live in globally scoped tables.
 *
 * `api_metrics`, `ams_metrics`, and `job_metrics` have no account column, so a
 * re-run cannot clear them the way the account-scoped tables are cleared. Every
 * seeded row in those tables instead carries a reserved prefix in its primary
 * key, and the writer deletes exactly that namespace before refilling it. The
 * marker is part of the identifier, so it survives whatever else a developer
 * has put in the same local table.
 */

const SEED_UUID_PREFIX = '5eed0000';
const HEX_RADIX = 16;
const COUNTER_WIDTH = 12;

/** Matches only rows this seed wrote, for a `like` on the id cast to text. */
export const SEED_UUID_LIKE_PATTERN = `${SEED_UUID_PREFIX}-%`;

export const createSeedIds = () => {
    let counter = 0;

    return {
        next: () => {
            counter += 1;
            return `${SEED_UUID_PREFIX}-0000-4000-8000-${counter.toString(HEX_RADIX).padStart(COUNTER_WIDTH, '0')}`;
        },
    };
};

export type SeedIds = ReturnType<typeof createSeedIds>;
