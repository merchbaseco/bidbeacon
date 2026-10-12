type AmazonRejectionEntry = {
    code?: string;
    errorCode?: string;
    field?: string;
    index?: number;
    message?: string;
};

type AmazonRejection = AmazonRejectionEntry & {
    statusCode?: number;
    errors?: AmazonRejectionEntry[];
};

export const readAmazonRejection = (input: unknown): AmazonRejection => {
    if (isTransportFailure(input)) {
        return readTransportFailure(input);
    }
    return readRejectionBody(input);
};

const readRejectionBody = (input: unknown): AmazonRejection => {
    if (Array.isArray(input)) {
        return publishEntries(input.flatMap(readItemEntries));
    }
    if (!isRecord(input)) {
        return {};
    }
    if (Array.isArray(input.error)) {
        return withStatusCode(readRejectionBody(input.error), readStatusCode(input));
    }
    return readRecord(input);
};

const readRecord = (record: Record<string, unknown>): AmazonRejection => {
    const nested = nestedRecords(record);
    if (nested.some(isWireError)) {
        return withStatusCode(publishEntries(readItemEntries(record)), readStatusCode(record));
    }

    const entry = readEntry(record, readIndex(record));
    const errors = nested.map(item => readEntry(item, readIndex(item))).filter(hasContent);
    if (errors.length === 0) {
        return withStatusCode(entry, readStatusCode(record));
    }
    return withStatusCode({ ...entry, errors }, readStatusCode(record));
};

const readTransportFailure = (input: Error | Record<string, unknown>): AmazonRejection => {
    if ('amazonResponse' in input && input.amazonResponse !== undefined) {
        return withStatusCode(readAmazonRejection(input.amazonResponse), readStatusCode(input));
    }

    const message = readOwnMessage(input);
    const sanitized = message === undefined ? undefined : sanitizeMessage(message);
    return withStatusCode(sanitized === undefined ? {} : { message: sanitized }, readStatusCode(input));
};

const isTransportFailure = (input: unknown): input is Error | Record<string, unknown> => {
    if (input instanceof Error) {
        return true;
    }
    return isRecord(input) && 'amazonResponse' in input;
};

const readItemEntries = (item: unknown): AmazonRejectionEntry[] => {
    if (!isRecord(item)) {
        return [];
    }

    const index = readIndex(item);
    const nested = nestedRecords(item);
    if (nested.some(isWireError)) {
        return nested
            .filter(isWireError)
            .map(error => readWireEntry(error, item, index))
            .filter(hasContent);
    }

    const entry = readEntry(item, index);
    return hasContent(entry) ? [entry] : [];
};

const readWireEntry = (error: Record<string, unknown>, item: Record<string, unknown>, index: number | undefined): AmazonRejectionEntry => {
    const errorValue = isRecord(error.errorValue) ? error.errorValue : undefined;
    const value = errorValue === undefined ? undefined : Object.values(errorValue).find(isRecord);
    const cause = value !== undefined && isRecord(value.cause) ? value.cause : undefined;
    return entryFrom({
        code: firstText(readCode, [value?.reason, value?.code, error.code, item.code]),
        errorCode: firstText(readCode, [error.errorType, error.errorCode, item.errorCode]),
        field: firstText(readCode, [cause?.location, value?.field, error.field, item.field]),
        index,
        message: firstText(readMessage, [value?.message, value?.errorMessage, error.message, item.message]),
    });
};

const readEntry = (record: Record<string, unknown>, index: number | undefined): AmazonRejectionEntry =>
    entryFrom({
        code: readCode(record.code),
        errorCode: readCode(record.errorCode),
        field: readCode(record.field),
        index,
        message: readMessage(record.message),
    });

const publishEntries = (entries: AmazonRejectionEntry[]): AmazonRejection => {
    const first = entries[0];
    if (first === undefined) {
        return {};
    }
    if (entries.length === 1) {
        return first;
    }
    return { ...first, errors: entries };
};

const withStatusCode = (rejection: AmazonRejection, statusCode: number | undefined): AmazonRejection => {
    if (statusCode === undefined) {
        return rejection;
    }
    return { ...rejection, statusCode };
};

const entryFrom = (fields: AmazonRejectionEntry): AmazonRejectionEntry => {
    const entry: AmazonRejectionEntry = {};
    if (fields.code !== undefined) {
        entry.code = fields.code;
    }
    if (fields.errorCode !== undefined) {
        entry.errorCode = fields.errorCode;
    }
    if (fields.field !== undefined) {
        entry.field = fields.field;
    }
    if (fields.index !== undefined) {
        entry.index = fields.index;
    }
    if (fields.message !== undefined) {
        entry.message = fields.message;
    }
    return entry;
};

const nestedRecords = (record: Record<string, unknown>) => (Array.isArray(record.errors) ? record.errors.filter(isRecord) : []);

const isWireError = (value: Record<string, unknown>) => 'errorType' in value || 'errorValue' in value;

const hasContent = (entry: AmazonRejectionEntry) => Object.keys(entry).length > 0;

const firstText = (read: (value: unknown) => string | undefined, values: unknown[]) => {
    for (const value of values) {
        const present = read(value);
        if (present !== undefined) {
            return present;
        }
    }
    return undefined;
};

const readCode = (value: unknown) => (typeof value === 'string' && value.length > 0 ? redactBearer(value) : undefined);

const readMessage = (value: unknown) => (typeof value === 'string' && value.length > 0 ? sanitizeMessage(value) : undefined);

const sanitizeMessage = (message: string) => redactBearer(message).slice(0, 500);

const redactBearer = (value: string) => value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]');

const readIndex = (record: Record<string, unknown>) => (typeof record.index === 'number' && Number.isFinite(record.index) ? record.index : undefined);

const readStatusCode = (value: object) => ('statusCode' in value && typeof value.statusCode === 'number' && Number.isFinite(value.statusCode) ? value.statusCode : undefined);

const readOwnMessage = (value: object) => ('message' in value && typeof value.message === 'string' && value.message.length > 0 ? value.message : undefined);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
