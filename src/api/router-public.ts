import { publicOperationRouter } from './public/operation-router';

export const publicAppRouter = publicOperationRouter;

export const cliAppRouter = publicAppRouter;

export type PublicAppRouter = typeof publicAppRouter;
export type CliAppRouter = PublicAppRouter;
