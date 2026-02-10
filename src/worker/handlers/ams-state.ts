export const resolveAmsState = (state: unknown): string | null => {
    if (!state) {
        return null;
    }
    if (typeof state === 'string') {
        return state;
    }
    if (typeof state === 'object') {
        const typed = state as { state?: string; marketplace_settings?: Array<{ state?: string } | null> };
        if (typed.state) {
            return typed.state;
        }
        if (Array.isArray(typed.marketplace_settings)) {
            for (const entry of typed.marketplace_settings) {
                if (entry?.state) {
                    return entry.state;
                }
            }
        }
    }
    return null;
};

export const resolveAmsDeliveryStatus = (status: unknown): string | null => {
    if (!status || typeof status !== 'object') {
        return null;
    }
    const typed = status as { delivery_status?: string; marketplace_settings?: Array<{ delivery_status?: string } | null> };
    if (typed.delivery_status) {
        return typed.delivery_status;
    }
    if (Array.isArray(typed.marketplace_settings)) {
        for (const entry of typed.marketplace_settings) {
            if (entry?.delivery_status) {
                return entry.delivery_status;
            }
        }
    }
    return null;
};
