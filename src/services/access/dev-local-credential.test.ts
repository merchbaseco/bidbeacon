import { describe, expect, it } from 'vitest';
import { classifyDevLocalCredential, DEV_LOCAL_API_KEY } from './dev-local-credential';

describe('local dev credential', () => {
    it('accepts the dev key only when neither environment is production', () => {
        expect(classifyDevLocalCredential(DEV_LOCAL_API_KEY, { NODE_ENV: 'development', VARLOCK_ENV: 'development' })).toBe('accepted');
        expect(classifyDevLocalCredential(DEV_LOCAL_API_KEY, {})).toBe('accepted');
    });

    it('refuses the dev key when NODE_ENV is production', () => {
        expect(classifyDevLocalCredential(DEV_LOCAL_API_KEY, { NODE_ENV: 'production', BIDBEACON_AMAZON_ADS_GATEWAY: 'fake' })).toBe('refused');
    });

    it('refuses the dev key when VARLOCK_ENV is production', () => {
        expect(classifyDevLocalCredential(DEV_LOCAL_API_KEY, { NODE_ENV: 'development', VARLOCK_ENV: 'production' })).toBe('refused');
    });

    it('ignores any other flag that might try to enable it in production', () => {
        expect(
            classifyDevLocalCredential(DEV_LOCAL_API_KEY, {
                BIDBEACON_ALLOW_DEV_AUTH: 'true',
                NODE_ENV: 'production',
                VARLOCK_ENV: 'production',
            })
        ).toBe('refused');
    });

    it('leaves every other credential to the normal authorizers', () => {
        expect(classifyDevLocalCredential('ak_suite-key', { NODE_ENV: 'development' })).toBe('absent');
        expect(classifyDevLocalCredential('ak_dev_bidbeacon_local_extra', { NODE_ENV: 'production' })).toBe('absent');
    });
});
