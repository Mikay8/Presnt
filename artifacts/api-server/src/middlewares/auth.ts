import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: {
        id: string;
        email?: string;
      };
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
if (!supabaseUrl) throw new Error('SUPABASE_URL is not set');

// Fetch Supabase's public signing keys from their JWKS endpoint.
// jose caches and auto-refreshes these — no secret stored here.
const JWKS = createRemoteJWKSet(
  new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
);

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, JWKS);

    const sub = payload.sub;
    const email = payload.email as string | undefined;

    if (!sub) {
      res.status(401).json({ error: 'Invalid token: missing subject' });
      return;
    }

    req.user = { id: sub, email };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
