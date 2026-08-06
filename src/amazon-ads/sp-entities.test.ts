import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTargets, updateTargets } from './sp-entities';

const spApiMocks = vi.hoisted(() => ({
    request: vi.fn(),
}));

vi.mock('./sp-api', () => ({
    spRequest: spApiMocks.request,
}));

type SpRequestOptions = {
    apiName: string;
    path: string;
    profileId: number;
    body: unknown;
    responseSchema?: {
        parse: (input: unknown) => unknown;
    };
};

describe('Sponsored Products Target entity gateway', () => {
    beforeEach(() => {
        spApiMocks.request.mockReset();
    });

    it.each([
        { operation: createTargets, apiName: 'spCreateTargets', path: '/adsApi/v1/create/targets' },
        { operation: updateTargets, apiName: 'spUpdateTargets', path: '/adsApi/v1/update/targets' },
    ])('preserves $apiName partialSuccess payloads at the production boundary', async ({ operation, apiName, path }) => {
        const target = { targetId: 'target-1', state: 'ENABLED' };
        const response = {
            success: [],
            error: [],
            partialSuccess: [
                {
                    target,
                    errors: [{ code: 'BID_ADJUSTED', message: 'Amazon accepted the Target with an adjusted bid.' }],
                },
            ],
        };
        spApiMocks.request.mockImplementation(async (options: SpRequestOptions) => options.responseSchema?.parse(response));

        await expect(operation({ profileId: 3001, region: 'na', targets: [target] })).resolves.toEqual(response);
        expect(spApiMocks.request).toHaveBeenCalledWith(
            {
                apiName,
                path,
                profileId: 3001,
                body: { targets: [target] },
                responseSchema: expect.anything(),
            },
            'na'
        );
    });
});
