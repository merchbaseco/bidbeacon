export const getServerRuntimeFlags = (env: NodeJS.ProcessEnv = process.env) => {
    const disableServerJobRunner = parseBooleanEnv(env.DISABLE_SERVER_JOB_RUNNER) ?? false;

    return {
        disableServerJobRunner,
        runServerJobRunner: !disableServerJobRunner,
    };
};

const parseBooleanEnv = (value: string | undefined) => {
    if (value === undefined) {
        return undefined;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
        return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === '') {
        return false;
    }

    return undefined;
};
