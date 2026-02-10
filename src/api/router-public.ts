import { clientApiRouter } from './public/client';
import { router } from './trpc';

export const publicAppRouter = router({
    api: router({
        client: clientApiRouter,
        cli: clientApiRouter,
    }),
});

export const cliAppRouter = publicAppRouter;

export type PublicAppRouter = typeof publicAppRouter;
export type CliAppRouter = PublicAppRouter;
