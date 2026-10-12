type AmazonRejectionEntry = {
    code?: string;
    details?: string;
    errorCode?: string;
    field?: string;
    index?: number;
    message?: string;
    trigger?: string;
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
    if (nestedRecords(record).length > 0) {
        return withStatusCode(publishEntries(readItemEntries(record)), readStatusCode(record));
    }
    return withStatusCode(readEntry(record, readIndex(record)), readStatusCode(record));
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
    if (nested.length > 0) {
        return nested.map(error => readNestedError(error, item, index)).filter(hasContent);
    }

    const entry = readEntry(item, index);
    return hasContent(entry) ? [entry] : [];
};

const readNestedError = (error: Record<string, unknown>, item: Record<string, unknown>, index: number | undefined): AmazonRejectionEntry => {
    const nestedIndex = readIndex(error) ?? index;
    const variant = readErrorVariant(error.errorValue, readCode(error.errorType));
    const value = isRecord(variant?.value) ? variant.value : undefined;
    const scanned = mergeScans(scanAllowedStrings(error), scanAllowedStrings(value));
    const parsed = readWireEntry(error, item, nestedIndex, variant);
    const errorType = readCode(error.errorType) ?? variant?.key;
    const entry = entryFrom({
        code: parsed.code ?? scanned.code,
        details: parsed.details ?? scanned.details,
        errorCode: parsed.errorCode ?? scanned.errorCode ?? errorType,
        field: parsed.field ?? scanned.field,
        index: nestedIndex,
        message: parsed.message ?? scanned.message,
        trigger: parsed.trigger ?? scanned.trigger,
    });
    if (entry.code !== undefined || entry.message !== undefined || entry.field !== undefined || entry.details !== undefined || entry.trigger !== undefined) {
        return entry;
    }
    return entryFrom({ ...entry, code: errorType, errorCode: entry.errorCode ?? errorType });
};

const readWireEntry = (error: Record<string, unknown>, item: Record<string, unknown>, index: number | undefined, variant: ErrorVariant | undefined): AmazonRejectionEntry => {
    const value = isRecord(variant?.value) ? variant.value : undefined;
    const variantMessage = typeof variant?.value === 'string' ? variant.value : undefined;
    const cause = value !== undefined && isRecord(value.cause) ? value.cause : undefined;
    const details = firstText(readMessage, [value?.details, error.details, item.details]);
    return entryFrom({
        code: firstText(readCode, [value?.reason, value?.code, error.reason, error.code, item.code]),
        details,
        errorCode: firstText(readCode, [error.errorType, variant?.key, error.errorCode, item.errorCode]),
        field: firstText(readCode, [cause?.location, value?.field, error.field, item.field]),
        index,
        message: firstText(readMessage, [value?.message, variantMessage, value?.errorMessage, error.message, item.message, details]),
        trigger: firstText(readCode, [cause?.trigger, value?.trigger, error.trigger, item.trigger]),
    });
};

const readErrorVariant = (errorValue: unknown, errorType: string | undefined): ErrorVariant | undefined => {
    if (typeof errorValue === 'string' && errorValue.length > 0) {
        return { value: errorValue };
    }
    if (!isRecord(errorValue)) {
        return undefined;
    }
    if ('message' in errorValue || 'reason' in errorValue || 'cause' in errorValue || 'details' in errorValue) {
        return { value: errorValue };
    }

    const entries = Object.entries(errorValue).filter(([, value]) => value !== null && value !== undefined);
    const preferred = errorType === undefined ? undefined : entries.find(([key]) => key === errorType);
    const chosen = preferred ?? entries[0];
    if (chosen === undefined) {
        return undefined;
    }
    return { key: chosen[0], value: chosen[1] };
};

const readEntry = (record: Record<string, unknown>, index: number | undefined): AmazonRejectionEntry =>
    entryFrom({
        code: readCode(record.code),
        details: readMessage(record.details),
        errorCode: readCode(record.errorCode),
        field: readCode(record.field),
        index,
        message: readMessage(record.message),
        trigger: readCode(record.trigger),
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
    if (fields.trigger !== undefined) {
        entry.trigger = fields.trigger;
    }
    if (fields.details !== undefined) {
        entry.details = fields.details;
    }
    return entry;
};

type ErrorVariant = { key?: string; value: unknown };

const ALLOWED_STRING_KEYS = new Set(['code', 'description', 'details', 'errorcode', 'errormessage', 'errortype', 'field', 'location', 'message', 'reason', 'trigger']);

const nestedRecords = (record: Record<string, unknown>) => (Array.isArray(record.errors) ? record.errors.filter(isRecord) : []);

const hasContent = (entry: AmazonRejectionEntry) => Object.keys(entry).length > 0;

const scanAllowedStrings = (record: Record<string, unknown> | undefined): AmazonRejectionEntry => {
    if (record === undefined) {
        return {};
    }
    const found: AmazonRejectionEntry = {};
    for (const [key, value] of Object.entries(record)) {
        if (!ALLOWED_STRING_KEYS.has(key.toLowerCase()) || typeof value !== 'string' || value.length === 0) {
            continue;
        }
        const normalized = key.toLowerCase();
        if (normalized === 'code' || normalized === 'reason') {
            found.code ??= readCode(value);
        } else if (normalized === 'message' || normalized === 'errormessage' || normalized === 'description') {
            found.message ??= readMessage(value);
        } else if (normalized === 'details') {
            found.details ??= readMessage(value);
        } else if (normalized === 'errorcode' || normalized === 'errortype') {
            found.errorCode ??= readCode(value);
        } else if (normalized === 'field' || normalized === 'location') {
            found.field ??= readCode(value);
        } else if (normalized === 'trigger') {
            found.trigger ??= readCode(value);
        }
    }
    return found;
};

const mergeScans = (...scans: AmazonRejectionEntry[]): AmazonRejectionEntry => {
    const merged: AmazonRejectionEntry = {};
    for (const scan of scans) {
        merged.code ??= scan.code;
        merged.details ??= scan.details;
        merged.errorCode ??= scan.errorCode;
        merged.field ??= scan.field;
        merged.message ??= scan.message;
        merged.trigger ??= scan.trigger;
    }
    return merged;
};

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
