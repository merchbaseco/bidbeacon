import { router } from './trpc';
import { cliApiRouter } from './routers/api/cli';

export const cliAppRouter = router({
    api: router({
        cli: cliApiRouter,
    }),
});

export type CliAppRouter = typeof cliAppRouter;
