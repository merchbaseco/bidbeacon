export type OperationErrorCode = 'ACCOUNT_ACCESS_DENIED' | 'AUTHENTICATION_REQUIRED' | 'INVALID_INPUT';

export class OperationError extends Error {
    readonly code: OperationErrorCode;
    readonly details: Record<string, unknown>;

    constructor(code: OperationErrorCode, message: string, details: Record<string, unknown> = {}) {
        super(message);
        this.name = 'OperationError';
        this.code = code;
        this.details = details;
    }
}
