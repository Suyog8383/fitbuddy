import type { ZodOpenApiPathsObject } from 'zod-openapi';
import { HealthResponse } from '../schemas/responses.ts';
import { isPublic, json } from './helpers.ts';

export const healthPaths: ZodOpenApiPathsObject = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Is the server up?',
      description:
        'Process liveness only — does not check the database yet ' +
        '(a readiness check comes with deployment, Phase 15).',
      security: isPublic,
      responses: { 200: json('Server is running', HealthResponse) },
    },
  },
};
