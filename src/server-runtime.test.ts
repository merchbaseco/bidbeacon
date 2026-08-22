import { describe, expect, it } from 'vitest';
import { getServerRuntimeFlags } from './server-runtime';

describe('getServerRuntimeFlags', () => {
    it('runs the server job runner by default', () => {
        expect(getServerRuntimeFlags({})).toEqual({
            disableServerJobRunner: false,
            runServerJobRunner: true,
        });
    });

    it('disables the server job runner when the env toggle is true', () => {
        expect(getServerRuntimeFlags({ BIDBEACON_DISABLE_SERVER_JOB_RUNNER: 'true' })).toEqual({
            disableServerJobRunner: true,
            runServerJobRunner: false,
        });
    });

    it('treats false-like values as enabled', () => {
        expect(getServerRuntimeFlags({ BIDBEACON_DISABLE_SERVER_JOB_RUNNER: 'false' })).toEqual({
            disableServerJobRunner: false,
            runServerJobRunner: true,
        });
        expect(getServerRuntimeFlags({ BIDBEACON_DISABLE_SERVER_JOB_RUNNER: '0' })).toEqual({
            disableServerJobRunner: false,
            runServerJobRunner: true,
        });
    });

    it('ignores invalid toggle values and keeps the runner enabled', () => {
        expect(getServerRuntimeFlags({ BIDBEACON_DISABLE_SERVER_JOB_RUNNER: 'banana' })).toEqual({
            disableServerJobRunner: false,
            runServerJobRunner: true,
        });
    });
});
