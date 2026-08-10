export type OperationErrorCode =
    | 'ACCOUNT_ACCESS_DENIED'
    | 'AMAZON_REJECTED'
    | 'AMAZON_UNAVAILABLE'
    | 'AUTHENTICATION_REQUIRED'
    | 'COMPOSITE_PARTIAL_FAILURE'
    | 'CURSOR_INVALID'
    | 'EXECUTION_TIMEOUT'
    | 'INTERNAL_ERROR'
    | 'INVALID_INPUT'
    | 'RESPONSE_TOO_LARGE'
    | 'RESULT_TOO_LARGE'
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
