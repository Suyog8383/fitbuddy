import { z } from 'zod';

// Building blocks shared by several endpoints' schemas.

// Trim first, then check: "   " -> "" -> too short.
export const Name = z.string().trim().min(1, 'must not be empty');
