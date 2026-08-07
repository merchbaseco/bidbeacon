import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { OperationContext } from '@/operations/operation-context';
import { MCP_OPERATION_DEFINITIONS, MCP_SERVER_INFO, MCP_SERVER_INSTRUCTIONS } from './operation-definitions';
import { executeMcpOperation } from './tool-result';

export const createBidBeaconMcpServer = (context: OperationContext) => {
    const server = new McpServer(MCP_SERVER_INFO, {
        capabilities: { tools: {} },
        instructions: MCP_SERVER_INSTRUCTIONS,
    });

    for (const definition of MCP_OPERATION_DEFINITIONS) {
        server.registerTool(
            definition.name,
            {
                title: definition.title,
                description: definition.description,
                inputSchema: definition.inputSchema,
                outputSchema: definition.outputSchema,
                annotations: definition.annotations,
            },
            input => executeMcpOperation(definition, context, input)
        );
    }

    const definitionsByName = new Map(MCP_OPERATION_DEFINITIONS.map(definition => [definition.name, definition]));
    server.server.setRequestHandler(CallToolRequestSchema, request => {
        const definition = definitionsByName.get(request.params.name as (typeof MCP_OPERATION_DEFINITIONS)[number]['name']);
        if (!definition) {
            throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params.name} not found`);
        }
        if (request.params.task) {
            throw new McpError(ErrorCode.InvalidParams, 'Task-augmented tool calls are not supported.');
        }
        return executeMcpOperation(definition, context, request.params.arguments ?? {});
    });

    return server;
};
