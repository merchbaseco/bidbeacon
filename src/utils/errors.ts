const MAX_MESSAGE_LENGTH = 2000;
const MAX_DETAIL_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;

export type SerializedError = {
    message: string;
    name: string;
    code?: string;
    severity?: string;
    detail?: string;
    hint?: string;
    schema?: string;
    table?: string;
    column?: string;
    constraint?: string;
    stack?: string;
    cause?: Omit<SerializedError, 'cause'>;
};

export const serializeError = (error: unknown): SerializedError => {
    const record = asRecord(error);
    const serialized: SerializedError = {
        name: error instanceof Error ? error.name : 'Error',
        message: truncate(error instanceof Error ? error.message : String(error), MAX_MESSAGE_LENGTH),
    };

    assignIfPresent(serialized, 'code', getString(record, 'code'));
    assignIfPresent(serialized, 'severity', getString(record, 'severity'));
    assignIfPresent(serialized, 'detail', truncateOptional(getString(record, 'detail'), MAX_DETAIL_LENGTH));
    assignIfPresent(serialized, 'hint', truncateOptional(getString(record, 'hint'), MAX_DETAIL_LENGTH));
    assignIfPresent(serialized, 'schema', getString(record, 'schema_name') ?? getString(record, 'schema'));
    assignIfPresent(serialized, 'table', getString(record, 'table_name') ?? getString(record, 'table'));
    assignIfPresent(serialized, 'column', getString(record, 'column_name') ?? getString(record, 'column'));
    assignIfPresent(serialized, 'constraint', getString(record, 'constraint_name') ?? getString(record, 'constraint'));
    assignIfPresent(serialized, 'stack', truncateOptional(error instanceof Error ? error.stack : undefined, MAX_STACK_LENGTH));

    if (error instanceof Error && error.cause !== undefined && error.cause !== error) {
        const { cause: _cause, ...serializedCause } = serializeError(error.cause);
        serialized.cause = serializedCause;
    }

    return serialized;
};

export const formatError = (error: unknown): string => {
    const serialized = serializeError(error);
    const prefix = serialized.code ? `${serialized.code}: ` : '';
    const context = [
        serialized.constraint ? `constraint=${serialized.constraint}` : null,
        serialized.table ? `table=${serialized.table}` : null,
        serialized.column ? `column=${serialized.column}` : null,
    ].filter(Boolean);
    return `${prefix}${serialized.message}${context.length > 0 ? ` (${context.join(', ')})` : ''}`;
};

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

const getString = (record: Record<string, unknown>, key: string): string | undefined => {
    const value = record[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const truncate = (value: string, maxLength: number): string => (value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`);

const truncateOptional = (value: string | undefined, maxLength: number): string | undefined => (value === undefined ? undefined : truncate(value, maxLength));

const assignIfPresent = <K extends keyof SerializedError>(target: SerializedError, key: K, value: SerializedError[K] | undefined): void => {
    if (value !== undefined) {
        target[key] = value;
    }
};
