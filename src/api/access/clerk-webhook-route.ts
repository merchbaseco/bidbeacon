import type { AccessProjectionStore, ClerkIdentity } from '@merchbaseco/access';
import { createClerkAccessWebhookHandler } from '@merchbaseco/access';
import type { FastifyInstance } from 'fastify';

export const CLERK_ACCESS_WEBHOOK_PATH = '/api/webhooks/clerk/access';

export interface RegisterClerkAccessWebhookRouteOptions {
    issuer: string;
    onIdentityChanged?: (identity: ClerkIdentity) => Promise<void> | void;
    signingSecret: string;
    store: AccessProjectionStore;
}

export const registerClerkAccessWebhookRoute = (fastify: FastifyInstance, options: RegisterClerkAccessWebhookRouteOptions) =>
    fastify.register((scope, _pluginOptions, done) => {
        scope.removeContentTypeParser('application/json');
        scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, parserDone) => {
            parserDone(null, body);
        });

        const handleWebhook = createClerkAccessWebhookHandler(options);
        scope.post(CLERK_ACCESS_WEBHOOK_PATH, async (request, reply) => {
            const response = await handleWebhook(
                new Request(toRequestUrl(request), {
                    body: String(requireRawBody(request.body)),
                    headers: toFetchHeaders(request.headers),
                    method: 'POST',
                })
            );

            response.headers.forEach((value, name) => {
                reply.header(name, value);
            });
            const body = await response.text();
            return reply.code(response.status).send(body || null);
        });
        done();
    });

const requireRawBody = (body: unknown) => {
    if (typeof body === 'string') {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body;
    }
    throw new Error('Clerk webhook body was not preserved as raw input.');
};

const toFetchHeaders = (headers: Record<string, string | string[] | undefined>) => {
    const result = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                result.append(name, item);
            }
        } else if (value !== undefined) {
            result.set(name, value);
        }
    }
    return result;
};

const toRequestUrl = (request: { headers: { host?: string }; protocol: string; url: string }) => `${request.protocol}://${request.headers.host ?? 'localhost'}${request.url}`;
