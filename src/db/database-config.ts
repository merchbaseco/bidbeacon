const getDatabaseConfig = () => {
    const rawPort = process.env.BIDBEACON_DATABASE_PORT;
    const port = rawPort === undefined || rawPort === '' ? 5432 : Number(rawPort);
    const password = process.env.BIDBEACON_DATABASE_PASSWORD;

    if (password === undefined) {
        throw new Error('BIDBEACON_DATABASE_PASSWORD is required');
    }

    if (Number.isNaN(port) || port < 1 || port > 65535) {
        throw new Error('BIDBEACON_DATABASE_PORT must be a valid port number');
    }

    return {
        host: process.env.BIDBEACON_DATABASE_HOST ?? 'postgres',
        port,
        name: process.env.BIDBEACON_DATABASE_NAME ?? 'bidbeacon',
        user: process.env.BIDBEACON_DATABASE_USER ?? 'bidbeacon',
        password,
    };
};

export { getDatabaseConfig };
