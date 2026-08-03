import { readFile } from 'node:fs/promises';
import { type AccessMigrationAudit, assertCutoverInvariants, createAccessMigrationPlan } from '../src/services/access/access-migration';

const main = async () => {
    const inputPath = readFlag('--input');
    if (!inputPath) {
        throw new Error('Usage: bun run access:plan -- --input <audit.json>');
    }

    const audit = JSON.parse(await readFile(inputPath, 'utf8')) as AccessMigrationAudit;
    const plan = createAccessMigrationPlan(audit);
    assertCutoverInvariants(plan, audit.advertiserAccountIds);

    console.log(
        JSON.stringify(
            {
                planDigest: plan.planDigest,
                retiredMembershipAccountIds: plan.retiredMembershipAccountIds,
                retiredMembershipIds: plan.retiredMembershipIds,
                sourceCounts: plan.sourceCounts,
                targetCounts: plan.targetCounts,
                retainedMembershipMappings: plan.membershipMappings,
                preferenceMappings: plan.preferenceMappings,
                preservedFormerLegacyKeyScopeCount: plan.preservedFormerLegacyKeyScopeCount,
            },
            null,
            2
        )
    );
};

const readFlag = (name: string) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
