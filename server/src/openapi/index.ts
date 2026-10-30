import { createDocument } from 'zod-openapi';
import { env } from '../env.ts';
import { adminPaths } from './admin.ts';
import { authPaths } from './auth.ts';
import { healthPaths } from './health.ts';
import { usersPaths } from './users.ts';
import { workoutsPaths } from './workouts.ts';

// The whole API description, built once at startup from the Zod schemas.
// Served as /openapi.json (codegen, Postman) and /docs (Swagger UI).
//
// Page structure, top to bottom: info (with a navigation guide) ->
// servers -> tags in this order, each with a description -> operations.

// Markdown: Swagger UI renders it at the top of the page.
const description = `
REST API for the FitBuddy mobile app.

**How to navigate:** sections below are grouped by area. Use **Filter by tag** to jump to one.

- **Health** — is the server up
- **Auth** — register, login, tokens, email verification, password reset
- **Users** — the logged-in user: profile, password, account deletion
- **Workouts** — the user's own workouts
- **Admin** — user management and stats (ADMIN role only)

**Trying requests:** call \`POST /api/v1/auth/login\`, copy \`accessToken\`, click **Authorize** and paste it. Every 🔒 request then sends it.

**Errors** always look like \`{ "error": "...", "code": "...", "details"?: [...] }\`.
Switch on \`code\` in the app — \`error\` is for humans and may be reworded.
\`details\` (validation errors only) lists every bad field with its \`path\`.
`.trim();

export const openApiDocument = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'FitBuddy API',
    version: '1.0.0', // the /api/v1 contract
    description,
    contact: { name: 'FitBuddy', email: 'support@example.com' },
    license: { name: 'ISC' },
  },
  // The "Servers" dropdown. Deployed environments are added in Phase 15.
  servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local' }],
  // Order here = order of sections on the page.
  tags: [
    { name: 'Health', description: 'Server status' },
    {
      name: 'Auth',
      description:
        'Access token: JWT, 15 minutes, sent on every request. ' +
        'Refresh token: opaque, 30 days, single use — every refresh returns ' +
        'a new one, and reusing an old one logs that login out everywhere. ' +
        'Logging out ends the refresh token; the access token simply expires.',
    },
    {
      name: 'Users',
      description:
        '"me" = the user in the access token; there is no way to address ' +
        'another user here. PATCH: absent field = keep, `null` = clear.',
    },
    {
      name: 'Workouts',
      description:
        "Only the caller's own workouts. Someone else's workout is a 404, " +
        'exactly like one that does not exist.',
    },
    {
      name: 'Admin',
      description:
        'ADMIN role only, checked against the database on every request ' +
        '(401 = bad token, 403 = not an admin). No profile or health data.',
    },
  ],
  components: {
    securitySchemes: {
      // Shown as the "Authorize" button in Swagger UI.
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The `accessToken` from login, refresh or password change',
      },
    },
  },
  paths: {
    ...healthPaths,
    ...authPaths,
    ...usersPaths,
    ...workoutsPaths,
    ...adminPaths,
  },
});
