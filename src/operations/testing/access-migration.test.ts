import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { applyProductionMigrations } from './create-test-database';

describe('Advertiser Account access migration', () => {
    let client: PGlite | undefined;

    afterEach(async () => {
        await client?.close();
    });

    it('expands one legacy Amazon account membership to every matching marketplace-specific UUID', async () => {
        client = await PGlite.create('memory://');
        await applyProductionMigrations(client, { throughTag: '0053_modern_rafael_vega' });
        await client.exec(`
            INSERT INTO advertiser_account (id, ads_account_id, account_name, status, country_code, profile_id, entity_id, enabled)
            VALUES
                ('00000000-0000-4000-8000-000000000001', 'shared-amazon-account', 'US advertiser', 'CREATED', 'US', '1001', 'entity-us', true),
                ('00000000-0000-4000-8000-000000000002', 'shared-amazon-account', 'Canada advertiser', 'CREATED', 'CA', '1002', 'entity-ca', true),
                ('00000000-0000-4000-8000-000000000003', 'different-amazon-account', 'Unrelated advertiser', 'CREATED', 'US', '2001', 'entity-other', true);
            INSERT INTO user_account_access (id, merchbase_user_id, ads_account_id)
            VALUES ('00000000-0000-4000-8000-000000000010', 'mbu_migration_test', 'shared-amazon-account');
        `);

        await applyProductionMigrations(client, { fromTag: '0053_modern_rafael_vega' });

        const rows = await client.query<{ advertiser_account_id: string; ads_account_id: string; merchbase_user_id: string }>(
            `SELECT advertiser_account_id, ads_account_id, merchbase_user_id
             FROM user_account_access
             WHERE merchbase_user_id = 'mbu_migration_test'
             ORDER BY advertiser_account_id`
        );

        expect(rows.rows).toEqual([
            {
                ads_account_id: 'shared-amazon-account',
                advertiser_account_id: '00000000-0000-4000-8000-000000000001',
                merchbase_user_id: 'mbu_migration_test',
            },
            {
                ads_account_id: 'shared-amazon-account',
                advertiser_account_id: '00000000-0000-4000-8000-000000000002',
                merchbase_user_id: 'mbu_migration_test',
            },
        ]);
    });
});
