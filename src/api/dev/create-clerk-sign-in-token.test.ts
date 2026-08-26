import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { assertDevSignInAllowed } from './create-clerk-sign-in-token';

/**
 * This endpoint hands out an authenticated session to anyone who asks, so its
 * gate is the whole security story. Each refusal below is a way the endpoint
 * could be reached by something other than a developer's own dev server.
 */

const allowed = { hostHeader: 'localhost:4173', nodeEnv: 'development', userId: 'user_dev' };

const codeOf = (call: () => unknown) => {
    try {
        call();
    } catch (error) {
        return error instanceof TRPCError ? error.code : 'not-a-trpc-error';
    }
    return 'did-not-throw';
};

describe('assertDevSignInAllowed', () => {
    it('mints for the configured user on a loopback dev server', () => {
        expect(assertDevSignInAllowed(allowed)).toBe('user_dev');
        expect(assertDevSignInAllowed({ ...allowed, hostHeader: '127.0.0.1:4173' })).toBe('user_dev');
        expect(assertDevSignInAllowed({ ...allowed, hostHeader: '[::1]:8080' })).toBe('user_dev');
        expect(assertDevSignInAllowed({ ...allowed, nodeEnv: undefined })).toBe('user_dev');
    });

    it('refuses production even when everything else is configured', () => {
        expect(codeOf(() => assertDevSignInAllowed({ ...allowed, nodeEnv: 'production' }))).toBe('FORBIDDEN');
    });

    it('refuses when no development user is configured', () => {
        expect(codeOf(() => assertDevSignInAllowed({ ...allowed, userId: undefined }))).toBe('NOT_FOUND');
        expect(codeOf(() => assertDevSignInAllowed({ ...allowed, userId: '   ' }))).toBe('NOT_FOUND');
    });

    it('refuses a request that did not arrive over loopback', () => {
        for (const hostHeader of [undefined, '', 'bidbeacon.merchbase.co', 'localhost.evil.example', '10.0.0.4:4173', '[2001:db8::1]:4173']) {
            expect(
                codeOf(() => assertDevSignInAllowed({ ...allowed, hostHeader })),
                `host ${hostHeader}`
            ).toBe('FORBIDDEN');
        }
    });
});
