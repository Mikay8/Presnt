import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// ── Config ───────────────────────────────────────────────────────────────────
const supabaseUrl     = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl)     throw new Error('SUPABASE_URL is not set');
if (!supabaseAnonKey) throw new Error('SUPABASE_ANON_KEY is not set');

// ── POST /api/auth/sign-out ──────────────────────────────────────────────────
// Calls Supabase's auth REST endpoint using the user's own access token.
// No service role key needed — the user's JWT is the credential.
//
// scope (optional, default 'global'):
//   'global'  – revoke all refresh tokens → signs user out of every device
//   'local'   – revoke only this token
//   'others'  – revoke all tokens except this one
router.post('/auth/sign-out', requireAuth, async (req, res) => {
  const scope = (req.body?.scope as 'global' | 'local' | 'others') ?? 'global';

  // The raw Bearer token was already validated by requireAuth middleware
  const token = req.headers.authorization!.slice(7);

  const response = await fetch(
    `${supabaseUrl}/auth/v1/logout?scope=${scope}`,
    {
      method:  'POST',
      headers: {
        'apikey':        supabaseAnonKey,
        'Authorization': `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    res.status(response.status).json({ error: 'Sign out failed', detail });
    return;
  }

  res.json({ message: 'Signed out successfully', scope });
});

export default router;
