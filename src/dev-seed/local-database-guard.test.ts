import { describe, expect, it } from 'vitest';
import { assertLocalSeedTarget, SeedTargetRefusedError } from './local-database-guard';

const NOT_LOOPBACK = /is not loopback/;
const NODE_ENV_PRODUCTION = /NODE_ENV is production/;
const HOST_NOT_SET = /BIDBEACON_DATABASE_HOST is not set/;
const NAMED_TARGET = /db\.internal:5432\/bidbeacon/;

describe('assertLocalSeedTarget', () => {
    it('accepts loopback hosts', () => {
        for (const host of ['127.0.0.1', 'localhost', '[::1]', '  127.0.0.1  ']) {
            expect(assertLocalSeedTarget({ database: 'bidbeacon', host, port: 5433 }).port).toBe(5433);
        }
    });

    // The two hosts `.env.schema` actually resolves. Neither may ever be seeded:
    // one is production, and the other is the shared database that a plain
    // `bun run dev` on a MacBook talks to.
    it('refuses the production compose host', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: 'postgres', port: 5432 })).toThrow(SeedTargetRefusedError);
    });

    it('refuses the shared database reached over Tailscale', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: 'zachs-mac-mini.taila0b849.ts.net', port: 5432 })).toThrow(NOT_LOOPBACK);
    });

    it('refuses a loopback host when NODE_ENV is production', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: '127.0.0.1', nodeEnv: 'production', port: 5432 })).toThrow(NODE_ENV_PRODUCTION);
    });

    it('refuses a hostname that merely starts with a loopback address', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: '127.0.0.1.attacker.example', port: 5432 })).toThrow(NOT_LOOPBACK);
    });

    it('refuses a missing host rather than defaulting to one', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: '', port: 5432 })).toThrow(HOST_NOT_SET);
    });

    it('names the refused target so the message is actionable', () => {
        expect(() => assertLocalSeedTarget({ database: 'bidbeacon', host: 'db.internal', port: 5432 })).toThrow(NAMED_TARGET);
    });
});
