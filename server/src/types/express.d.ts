// Declaration merging: add our own field to Express's Request type.
// Type-only (a .d.ts file never runs), so it's fine with type stripping.

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth after the access token is verified.
      // Optional: routes without requireAuth don't have it.
      user?: { id: string };
    }
  }
}

// Makes this file a module, so `declare global` is allowed.
export {};
