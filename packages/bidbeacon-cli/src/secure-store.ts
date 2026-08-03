import { spawnSync } from 'node:child_process';
import { MERCHBASE_API_KEY_KEYCHAIN_ACCOUNT, MERCHBASE_API_KEY_KEYCHAIN_SERVICE } from '@merchbaseco/access';

const SECURE_STORE_SERVICE = MERCHBASE_API_KEY_KEYCHAIN_SERVICE;
const SECURE_STORE_ACCOUNT = MERCHBASE_API_KEY_KEYCHAIN_ACCOUNT;
const SECURE_STORE_LABEL = 'Merchbase API key';

export type SecureStoreBackend = 'macos-keychain' | 'linux-secret-service' | 'unsupported';

export type SecureStoreStatus = {
    backend: SecureStoreBackend;
    label: string;
    available: boolean;
    configured: boolean;
    detail?: string;
};

export type SecureStore = {
    getStatus: () => SecureStoreStatus;
    readSecret: () => string | undefined;
    writeSecret: (secret: string) => void;
    clearSecret: () => boolean;
};

type CommandResult = {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
};

type CommandRunner = (command: string, args: string[], options?: { input?: string }) => CommandResult;

export const createSecureStore = (options: { platform?: NodeJS.Platform; runCommand?: CommandRunner } = {}): SecureStore => {
    const platform = options.platform ?? process.platform;
    const runCommand = options.runCommand ?? defaultRunCommand;

    if (platform === 'darwin') {
        return createMacOsKeychainStore(runCommand);
    }
    if (platform === 'linux') {
        return createLinuxSecretServiceStore(runCommand);
    }
    return createUnsupportedStore(platform);
};

const defaultRunCommand: CommandRunner = (command, args, options) => {
    const result = spawnSync(command, args, {
        encoding: 'utf8',
        input: options?.input,
        stdio: 'pipe',
    });

    return {
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error,
    };
};

const createMacOsKeychainStore = (runCommand: CommandRunner): SecureStore => {
    return {
        getStatus: () => {
            const result = runCommand('security', ['find-generic-password', '-s', SECURE_STORE_SERVICE, '-a', SECURE_STORE_ACCOUNT]);
            if (isMissingCommand(result)) {
                return {
                    backend: 'macos-keychain',
                    label: 'macOS Keychain',
                    available: false,
                    configured: false,
                    detail: 'The `security` command is unavailable.',
                };
            }
            if (isSuccessful(result)) {
                return {
                    backend: 'macos-keychain',
                    label: 'macOS Keychain',
                    available: true,
                    configured: true,
                };
            }
            if (isMacOsMissingSecret(result)) {
                return {
                    backend: 'macos-keychain',
                    label: 'macOS Keychain',
                    available: true,
                    configured: false,
                };
            }
            return {
                backend: 'macos-keychain',
                label: 'macOS Keychain',
                available: true,
                configured: false,
                detail: describeCommandFailure(result),
            };
        },
        readSecret: () => {
            const result = runCommand('security', ['find-generic-password', '-s', SECURE_STORE_SERVICE, '-a', SECURE_STORE_ACCOUNT, '-w']);
            if (isSuccessful(result)) {
                return result.stdout.trim() || undefined;
            }
            if (isMacOsMissingSecret(result)) {
                return undefined;
            }
            throw new Error(`Unable to read API key from macOS Keychain. ${describeCommandFailure(result)}`);
        },
        writeSecret: secret => {
            const result = runCommand('security', ['add-generic-password', '-U', '-s', SECURE_STORE_SERVICE, '-a', SECURE_STORE_ACCOUNT, '-l', SECURE_STORE_LABEL, '-w', secret]);
            if (!isSuccessful(result)) {
                throw new Error(`Unable to save API key to macOS Keychain. ${describeCommandFailure(result)}`);
            }
        },
        clearSecret: () => {
            const result = runCommand('security', ['delete-generic-password', '-s', SECURE_STORE_SERVICE, '-a', SECURE_STORE_ACCOUNT]);
            if (isSuccessful(result)) {
                return true;
            }
            if (isMacOsMissingSecret(result)) {
                return false;
            }
            throw new Error(`Unable to clear API key from macOS Keychain. ${describeCommandFailure(result)}`);
        },
    };
};

const createLinuxSecretServiceStore = (runCommand: CommandRunner): SecureStore => {
    return {
        getStatus: () => {
            const result = runCommand('secret-tool', ['lookup', 'service', SECURE_STORE_SERVICE, 'account', SECURE_STORE_ACCOUNT]);
            if (isMissingCommand(result)) {
                return {
                    backend: 'linux-secret-service',
                    label: 'Secret Service',
                    available: false,
                    configured: false,
                    detail: 'The `secret-tool` command is unavailable.',
                };
            }
            if (isSuccessful(result)) {
                return {
                    backend: 'linux-secret-service',
                    label: 'Secret Service',
                    available: true,
                    configured: Boolean(result.stdout.trim()),
                };
            }
            if (isLinuxMissingSecret(result)) {
                return {
                    backend: 'linux-secret-service',
                    label: 'Secret Service',
                    available: true,
                    configured: false,
                };
            }
            return {
                backend: 'linux-secret-service',
                label: 'Secret Service',
                available: true,
                configured: false,
                detail: describeCommandFailure(result),
            };
        },
        readSecret: () => {
            const result = runCommand('secret-tool', ['lookup', 'service', SECURE_STORE_SERVICE, 'account', SECURE_STORE_ACCOUNT]);
            if (isSuccessful(result)) {
                return result.stdout.trim() || undefined;
            }
            if (isLinuxMissingSecret(result)) {
                return undefined;
            }
            throw new Error(`Unable to read API key from Secret Service. ${describeCommandFailure(result)}`);
        },
        writeSecret: secret => {
            const result = runCommand('secret-tool', ['store', '--label', SECURE_STORE_LABEL, 'service', SECURE_STORE_SERVICE, 'account', SECURE_STORE_ACCOUNT], {
                input: secret,
            });
            if (!isSuccessful(result)) {
                throw new Error(`Unable to save API key to Secret Service. ${describeCommandFailure(result)}`);
            }
        },
        clearSecret: () => {
            const result = runCommand('secret-tool', ['clear', 'service', SECURE_STORE_SERVICE, 'account', SECURE_STORE_ACCOUNT]);
            if (isSuccessful(result)) {
                return true;
            }
            if (isLinuxMissingSecret(result)) {
                return false;
            }
            throw new Error(`Unable to clear API key from Secret Service. ${describeCommandFailure(result)}`);
        },
    };
};

const createUnsupportedStore = (platform: NodeJS.Platform): SecureStore => {
    return {
        getStatus: () => ({
            backend: 'unsupported',
            label: `Unsupported platform (${platform})`,
            available: false,
            configured: false,
            detail: 'Secure-store auth is currently supported on macOS and Linux.',
        }),
        readSecret: () => undefined,
        writeSecret: () => {
            throw new Error(`Secure-store auth is unsupported on ${platform}. Use MERCHBASE_API_KEY for automation.`);
        },
        clearSecret: () => false,
    };
};

const isSuccessful = (result: CommandResult) => result.error === undefined && result.status === 0;

const isMissingCommand = (result: CommandResult) => getErrorCode(result.error) === 'ENOENT';

const isMacOsMissingSecret = (result: CommandResult) => {
    const message = `${result.stderr}\n${result.stdout}`.toLowerCase();
    return message.includes('could not be found') || message.includes('item could not be found');
};

const isLinuxMissingSecret = (result: CommandResult) => result.status === 1 && result.stderr.trim().length === 0 && result.stdout.trim().length === 0;

const describeCommandFailure = (result: CommandResult) => {
    if (result.error) {
        return result.error.message;
    }

    const message = result.stderr.trim() || result.stdout.trim();
    if (message) {
        return message;
    }

    return `Command exited with status ${String(result.status)}.`;
};

const getErrorCode = (error?: Error) => {
    if (!error) {
        return undefined;
    }

    const candidate = error as Error & { code?: string };
    return candidate.code;
};
