type LogLevel = 'info' | 'warn' | 'error';

interface SimpleLogger {
    info: LogMethod;
    warn: LogMethod;
    error: LogMethod;
    child: (childContext: Record<string, unknown>) => SimpleLogger;
}

type LogMethod = (...args: unknown[]) => void;

const formatContext = (context?: Record<string, unknown>) => {
    if (!context || Object.keys(context).length === 0) {
        return '';
    }

    const parts = Object.entries(context).map(([key, value]) => `${key}=${serialize(value)}`);
    return `[${parts.join(' ')}] `;
};

const serialize = (value: unknown) => {
    if (value === null || value === undefined) {
        return String(value);
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '[object]';
        }
    }
    return String(value);
};

const createLogger = (context?: Record<string, unknown>): SimpleLogger => {
    const prefix = formatContext(context);

    const write =
        (level: LogLevel): LogMethod =>
        (...args: unknown[]) => {
            const writer = level === 'info' ? console.log : level === 'warn' ? console.warn : console.error;

            if (args.length === 0) {
                writer(prefix.trimEnd());
                return;
            }

            if (typeof args[0] === 'object' && typeof args[1] === 'string') {
                writer(`${prefix}${args[1]}`, args[0]);
                return;
            }

            if (typeof args[0] === 'string') {
                writer(`${prefix}${args[0]}`, ...args.slice(1));
                return;
            }

            writer(prefix, ...args);
        };

    const child = (childContext: Record<string, unknown>) => createLogger({ ...(context ?? {}), ...childContext });

    return {
        info: write('info'),
        warn: write('warn'),
        error: write('error'),
        child,
    };
};

export const createJobLogger = (jobName: string, jobId: string, context?: Record<string, unknown>) =>
    createLogger({
        jobName,
        jobId,
        ...context,
    });

export const createContextLogger = (context: Record<string, unknown>) => createLogger(context);

export const logger = createLogger();
