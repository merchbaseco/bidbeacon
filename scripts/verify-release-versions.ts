import { assertReleaseVersionSync } from '../src/lib/release-version-sync';

const main = async () => {
    await assertReleaseVersionSync();
    console.log('Release versions and bun.lock are in sync.');
};

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
