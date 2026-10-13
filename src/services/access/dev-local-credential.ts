export const DEV_LOCAL_API_KEY = 'ak_dev_bidbeacon_local';

export type DevLocalCredentialDecision = 'absent' | 'accepted' | 'refused';

export const classifyDevLocalCredential = (token: string, env: NodeJS.ProcessEnv): DevLocalCredentialDecision => {
    if (token !== DEV_LOCAL_API_KEY) {
        return 'absent';
    }
    if (env.NODE_ENV === 'production' || env.VARLOCK_ENV === 'production') {
        return 'refused';
    }
    return 'accepted';
};
