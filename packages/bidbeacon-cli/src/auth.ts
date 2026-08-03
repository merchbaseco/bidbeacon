import { MERCHBASE_API_KEY_ENV } from '@merchbaseco/access';
import { createSecureStore, type SecureStore, type SecureStoreStatus } from './secure-store';

export const API_KEY_ENV_VAR = MERCHBASE_API_KEY_ENV;

export type AuthSource = 'env' | 'secure-store' | 'none';

export type AuthState = {
    apiKey?: string;
    source: AuthSource;
    envOverride: boolean;
    secureStore: SecureStoreStatus;
};

export const loadAuthState = (options: { env?: NodeJS.ProcessEnv; secureStore?: SecureStore } = {}): AuthState => {
    const env = options.env ?? process.env;
    const secureStore = options.secureStore ?? createSecureStore();
    const secureStoreStatus = secureStore.getStatus();
    const envApiKey = resolveEnvValue(env, API_KEY_ENV_VAR);

    if (envApiKey) {
        return {
            apiKey: envApiKey,
            source: 'env',
            envOverride: true,
            secureStore: secureStoreStatus,
        };
    }

    if (secureStoreStatus.available && secureStoreStatus.configured) {
        const storedApiKey = secureStore.readSecret();
        if (storedApiKey) {
            return {
                apiKey: storedApiKey,
                source: 'secure-store',
                envOverride: false,
                secureStore: {
                    ...secureStoreStatus,
                    configured: true,
                },
            };
        }
    }

    return {
        source: 'none',
        envOverride: false,
        secureStore: secureStoreStatus,
    };
};

export const setStoredApiKey = (apiKey: string, options: { env?: NodeJS.ProcessEnv; secureStore?: SecureStore } = {}) => {
    const trimmedApiKey = apiKey.trim();
    if (trimmedApiKey.length === 0) {
        throw new Error('API key cannot be empty.');
    }

    const secureStore = options.secureStore ?? createSecureStore();
    const secureStoreStatus = secureStore.getStatus();
    if (!secureStoreStatus.available) {
        throw new Error(getSecureStoreUnavailableMessage(secureStoreStatus));
    }

    secureStore.writeSecret(trimmedApiKey);
    return loadAuthState({
        env: options.env,
        secureStore,
    });
};

export const clearStoredApiKey = (options: { env?: NodeJS.ProcessEnv; secureStore?: SecureStore } = {}) => {
    const secureStore = options.secureStore ?? createSecureStore();
    const secureStoreStatus = secureStore.getStatus();
    if (!secureStoreStatus.available) {
        throw new Error(getSecureStoreUnavailableMessage(secureStoreStatus));
    }

    const cleared = secureStore.clearSecret();
    return {
        cleared,
        auth: loadAuthState({
            env: options.env,
            secureStore,
        }),
    };
};

export const getMissingApiKeyMessage = () => {
    return `Missing Merchbase auth. Run \`bb auth set\` for local use or set ${API_KEY_ENV_VAR} for automation, CI, and agent runtimes.`;
};

const getSecureStoreUnavailableMessage = (status: SecureStoreStatus) => {
    const detail = status.detail ? ` ${status.detail}` : '';
    return `Secure-store auth is unavailable. Set ${API_KEY_ENV_VAR} for automation/CI/agent runtimes or use a supported secure store.${detail}`;
};

const resolveEnvValue = (env: NodeJS.ProcessEnv, name: string) => {
    const value = env[name]?.trim();
    return value ? value : undefined;
};
