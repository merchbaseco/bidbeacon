import { router } from '@/api/trpc';
import { devCreateClerkSignInToken } from './create-clerk-sign-in-token';

/**
 * Development-only procedures. Mounted on the dashboard's private app router
 * rather than under `api.*`, so nothing here reaches the published
 * `@bidbeacon/http-client` surface. Every procedure gates itself — see
 * `create-clerk-sign-in-token.ts`.
 */
export const devRouter = router({
    createClerkSignInToken: devCreateClerkSignInToken,
});
