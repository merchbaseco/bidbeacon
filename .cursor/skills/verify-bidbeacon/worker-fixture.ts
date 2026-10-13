import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { advertiserAccount, amsSpTraffic } from '@/db/schema';
import { hasCurrentAccountAccess } from '@/jobs/account-access-gate';
import { resolveAmsAccountIds } from '@/worker/account-resolution';
import { createDatabaseAmsAccountLookup } from '@/worker/database-account-resolution';
import { processAmsMessage } from '@/worker/message-processor';
import { routePayload } from '@/worker/router';
import { FIXTURE_CLICKS, FIXTURE_COST, FIXTURE_IDEMPOTENCY_ID, FIXTURE_IMPRESSIONS, SEED_ADS_ACCOUNT_ID } from './constants';
import { readRun } from './run-file';

const main = async () => {
    const command = process.argv[2];
    if (command === 'fixture') {
        await ingest();
        return;
    }
    if (command === 'show') {
        await show();
        return;
    }
    process.stderr.write('Use worker fixture or worker show.\n');
    process.exit(2);
};

const ingest = async () => {
    const account = await db.select({ entityId: advertiserAccount.entityId }).from(advertiserAccount).where(eq(advertiserAccount.adsAccountId, SEED_ADS_ACCOUNT_ID)).limit(1);
    const advertiserId = account[0]?.entityId;
    if (!advertiserId) {
        throw new Error('Seeded advertiser account has no entity id.');
    }
    const payload = {
        ad_group_id: 'verify-ad-group',
        ad_id: 'verify-ad',
        advertiser_id: advertiserId,
        campaign_id: 'verify-campaign',
        clicks: FIXTURE_CLICKS,
        cost: FIXTURE_COST,
        currency: 'USD',
        dataset_id: 'sp-traffic',
        idempotency_id: FIXTURE_IDEMPOTENCY_ID,
        impressions: FIXTURE_IMPRESSIONS,
        keyword_id: 'verify-keyword',
        keyword_text: 'verify bidbeacon fixture',
        marketplace_id: 'ATVPDKIKX0DER',
        match_type: 'EXACT',
        placement: 'Top of Search on-Amazon',
        time_window_start: '2026-10-13T00:00:00Z',
    };
    let sqsDeleteCalls = 0;
    const result = await processAmsMessage(
        { Body: JSON.stringify(payload), MessageId: FIXTURE_IDEMPOTENCY_ID, ReceiptHandle: 'verify-local-receipt' },
        {
            checkAccountAccess: hasCurrentAccountAccess,
            deleteMessage: async () => {
                sqsDeleteCalls += 1;
            },
            resolveAccountIds: candidate => resolveAmsAccountIds(candidate, createDatabaseAmsAccountLookup(db)),
            routePayload,
        }
    );
    const row = await showRow();
    const evidence = {
        deleteMessage: 'local noop',
        result,
        row,
        sqsDeleteCalls,
    };
    const run = await readRun();
    const path = join(run.evidenceDir, 'worker/fixture.json');
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, `${JSON.stringify(evidence, null, 2)}\n`);
    if (result.status !== 'processed' || row?.clicks !== FIXTURE_CLICKS || sqsDeleteCalls !== 1) {
        process.stderr.write(`${path}\n`);
        process.exit(1);
    }
    process.stdout.write(`${path}\n`);
    process.exit(0);
};

const show = async () => {
    const row = await showRow();
    process.stdout.write(`${JSON.stringify(row)}\n`);
    process.exit(row ? 0 : 1);
};

const showRow = async () => {
    const rows = await db
        .select({
            advertiserId: amsSpTraffic.advertiserId,
            clicks: amsSpTraffic.clicks,
            cost: amsSpTraffic.cost,
            idempotencyId: amsSpTraffic.idempotencyId,
            impressions: amsSpTraffic.impressions,
        })
        .from(amsSpTraffic)
        .where(eq(amsSpTraffic.idempotencyId, FIXTURE_IDEMPOTENCY_ID))
        .limit(1);
    return rows[0] ?? null;
};

main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
