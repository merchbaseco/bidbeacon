import { cliApiRouter } from './routers/api/cli';
import { router } from './trpc';

export const cliAppRouter = router({
    api: router({
        cli: cliApiRouter,
    }),
});

export type CliAppRouter = typeof cliAppRouter;
