import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(8080),
  },
  runtimeEnv: {
    PORT: process.env.PORT,
  },
});

