import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../api/router.js';

export const api = createTRPCReact<AppRouter>();
