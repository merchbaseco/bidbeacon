import { clientRestProcedures } from './public/client-rest';
import { router } from './trpc';

export const publicAppRouter = router(clientRestProcedures);

export const cliAppRouter = publicAppRouter;

export type PublicAppRouter = typeof publicAppRouter;
export type CliAppRouter = PublicAppRouter;
