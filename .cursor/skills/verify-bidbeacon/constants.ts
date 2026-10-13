export const SEED_ADS_ACCOUNT_ID = 'amzn1.ads-account.g.dev5eedcedarcoil0000000001';
export const SEED_ADVERTISER_ACCOUNT_ID = '5eed0000-0000-4000-8000-000000000001';
export const SEED_ACCOUNT_NAME = 'Cedar & Coil (dev seed)';
export const SEEDED_CAMPAIGN_NAME = 'SP - Trail Runner Belt - Auto';
export const SEEDED_OTHER_CAMPAIGN_NAME = 'SP - Headlamp - PT';
export const FIXTURE_IDEMPOTENCY_ID = 'verify-bidbeacon-sp-traffic';
export const FIXTURE_CLICKS = 7;
export const FIXTURE_IMPRESSIONS = 42;
export const FIXTURE_COST = 1.25;
export const EVIDENCE_ROOT = '/tmp/bidbeacon-verify/evidence';
export const STATE_ROOT = '/tmp/bidbeacon-verify';
export const RUN_PATH = '/tmp/bidbeacon-verify/run.json';
export const DASHBOARD_PORTS = [4173, 4174] as const;

const AMAZON_EXACT_NAMES = new Set(['accounts.sync', 'accounts.syncAdEntities', 'ads.targets.updateBid', 'ads.adGroups.updateBid', 'reports.create', 'reports.retrieve', 'reports.triggerUpdate']);

export const amazonWriteRefusal = (name: string) => {
    if (name.startsWith('create_') || name.startsWith('update_') || AMAZON_EXACT_NAMES.has(name)) {
        return `Refusing ${name}. That call uses the live Amazon Ads gateway. Verification does not send it.`;
    }
    return null;
};

export type VerifyRun = {
    id: string;
    owned: boolean;
    apiPort: number;
    dashboardPort: number;
    apiPid: number | null;
    dashboardPid: number | null;
    chromePid: number | null;
    chromeDir: string | null;
    apiBase: string;
    dashboardBase: string;
    evidenceDir: string;
    tokenPath: string;
    dir: string;
};
