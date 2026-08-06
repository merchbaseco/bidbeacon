export type OperationErrorCode =
    | 'ACCOUNT_ACCESS_DENIED'
    | 'AMAZON_REJECTED'
    | 'AMAZON_UNAVAILABLE'
    | 'AUTHENTICATION_REQUIRED'
    | 'CURSOR_INVALID'
    | 'INTERNAL_ERROR'
    | 'INVALID_INPUT'
    | 'RESOURCE_NOT_FOUND';

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
