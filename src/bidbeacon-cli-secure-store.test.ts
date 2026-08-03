import { describe, expect, it } from 'vitest';
import { createSecureStore } from '../packages/bidbeacon-cli/src/secure-store';

describe('bidbeacon cli secure store', () => {
    it('uses macOS Keychain commands on darwin', () => {
        const calls: Array<{ command: string; args: string[]; input?: string }> = [];
        let secret: string | undefined;
        const secureStore = createSecureStore({
            platform: 'darwin',
            runCommand: (command, args, options) => {
                calls.push({ command, args, input: options?.input });

                if (command !== 'security') {
                    return { status: 1, stdout: '', stderr: 'unexpected command' };
                }

                if (args[0] === 'find-generic-password') {
                    if (!secret) {
                        return {
                            status: 44,
                            stdout: '',
                            stderr: 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
                        };
                    }

                    if (args.includes('-w')) {
                        return { status: 0, stdout: `${secret}\n`, stderr: '' };
                    }

                    return { status: 0, stdout: '', stderr: '' };
                }

                if (args[0] === 'add-generic-password') {
                    secret = args.at(-1);
                    return { status: 0, stdout: '', stderr: '' };
                }

                if (args[0] === 'delete-generic-password') {
                    const hadSecret = Boolean(secret);
                    secret = undefined;
                    return hadSecret
                        ? { status: 0, stdout: '', stderr: '' }
                        : {
                              status: 44,
                              stdout: '',
                              stderr: 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.',
                          };
                }

                return { status: 1, stdout: '', stderr: 'unexpected args' };
            },
        });

        expect(secureStore.getStatus()).toMatchObject({
            backend: 'macos-keychain',
            available: true,
            configured: false,
        });

        secureStore.writeSecret('ak_saved');
        expect(secureStore.readSecret()).toBe('ak_saved');
        expect(secureStore.getStatus().configured).toBe(true);
        expect(secureStore.clearSecret()).toBe(true);
        expect(secureStore.getStatus().configured).toBe(false);

        expect(calls.some(call => call.args[0] === 'add-generic-password')).toBe(true);
        expect(calls.some(call => call.args[0] === 'delete-generic-password')).toBe(true);
    });

    it('reports unsupported platforms cleanly', () => {
        const secureStore = createSecureStore({ platform: 'win32' });

        expect(secureStore.getStatus()).toMatchObject({
            backend: 'unsupported',
            available: false,
            configured: false,
        });
    });
});
