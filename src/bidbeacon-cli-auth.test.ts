import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_KEY_ENV_VAR, clearStoredApiKey, loadAuthState, setStoredApiKey } from '../packages/bidbeacon-cli/src/auth';
import type { SecureStore } from '../packages/bidbeacon-cli/src/secure-store';

describe('bidbeacon cli auth', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('prefers the env api key over the secure-store value', () => {
        vi.stubEnv(API_KEY_ENV_VAR, 'bbk_env');
        const secureStore = createMockSecureStore({ secret: 'bbk_stored' });

        const auth = loadAuthState({ secureStore });

        expect(auth.source).toBe('env');
        expect(auth.apiKey).toBe('bbk_env');
        expect(auth.envOverride).toBe(true);
        expect(auth.secureStore.configured).toBe(true);
    });

    it('falls back to the secure store when no env override exists', () => {
        const secureStore = createMockSecureStore({ secret: 'bbk_stored' });

        const auth = loadAuthState({ env: {}, secureStore });

        expect(auth.source).toBe('secure-store');
        expect(auth.apiKey).toBe('bbk_stored');
        expect(auth.envOverride).toBe(false);
    });

    it('writes and clears the stored api key without exposing it', () => {
        const secureStore = createMockSecureStore();

        const saved = setStoredApiKey('  bbk_saved  ', { env: {}, secureStore });
        expect(saved.source).toBe('secure-store');
        expect(saved.apiKey).toBe('bbk_saved');

        const cleared = clearStoredApiKey({ env: {}, secureStore });
        expect(cleared.cleared).toBe(true);
        expect(cleared.auth.source).toBe('none');
        expect(cleared.auth.apiKey).toBeUndefined();
    });

    it('rejects auth set when the secure store is unavailable', () => {
        const secureStore = createMockSecureStore({ available: false, detail: 'No backend.' });

        expect(() => setStoredApiKey('bbk_saved', { secureStore })).toThrow('Secure-store auth is unavailable');
    });
});

const createMockSecureStore = (options: { secret?: string; available?: boolean; configured?: boolean; detail?: string } = {}): SecureStore => {
    let secret = options.secret;
    const available = options.available ?? true;

    return {
        getStatus: () => ({
            backend: 'macos-keychain',
            label: 'macOS Keychain',
            available,
            configured: options.configured ?? Boolean(secret),
            detail: options.detail,
        }),
        readSecret: () => secret,
        writeSecret: value => {
            if (!available) {
                throw new Error('Secure store unavailable');
            }
            secret = value;
        },
        clearSecret: () => {
            const hadSecret = Boolean(secret);
            secret = undefined;
            return hadSecret;
        },
    };
};
