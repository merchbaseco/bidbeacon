import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { OperationContext } from '@/operations/operation-context';
import { OperationError } from '@/operations/operation-errors';
import type { McpOperationDefinition } from './operation-definitions';

export const executeMcpOperation = async (definition: McpOperationDefinition, context: OperationContext, input: unknown): Promise<CallToolResult> => {
    try {
        const value = await definition.execute(context, input);
        const parsedOutput = definition.outputSchema.safeParse(value);
        if (!parsedOutput.success) {
            throw new OperationError('INTERNAL_ERROR', 'BidBeacon could not complete this operation.');
        }
        const text = JSON.stringify(parsedOutput.data);
        return {
            content: [{ type: 'text', text }],
            structuredContent: parsedOutput.data as Record<string, unknown>,
        };
    } catch (error) {
        return createMcpToolError(error);
    }
};

export const createMcpToolError = (error: unknown): CallToolResult => {
    const operationError = error instanceof OperationError ? error : new OperationError('INTERNAL_ERROR', 'BidBeacon could not complete this operation.');
    const payload = {
        error: {
            code: operationError.code,
            details: operationError.details,
            message: operationError.message,
        },
    };

    return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        isError: true,
    };
};
