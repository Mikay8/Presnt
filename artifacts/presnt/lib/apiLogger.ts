/**
 * apiLogger
 *
 * Thin wrapper around every Supabase query. Call `loggedQuery` instead of
 * running `.from(table).select/insert/...` directly when you want the call
 * tracked in `api_request_log`.
 *
 * Usage:
 *   import { loggedQuery, DOMAIN } from '@/lib/apiLogger';
 *
 *   const { data, error } = await loggedQuery({
 *     domain:  DOMAIN.EVENTS,
 *     method:  'GET',
 *     endpoint: 'events',
 *     orgId:   organization?.id,
 *     query:   supabase.from('events').select('*').eq('org_id', orgId),
 *   });
 */

import { supabase } from './supabase';

// ─── Domain taxonomy ──────────────────────────────────────────────────────────
export const DOMAIN = {
  AUTH:        'auth',
  EVENTS:      'events',
  MEMBERS:     'members',
  ATTENDANCE:  'attendance',
  EXCUSES:     'excuses',
  LOCATIONS:   'locations',
  ROLES:       'roles',
  CONFIG:      'config',
  BILLING:     'billing',
  ORGS:        'orgs',
  OTHER:       'other',
} as const;
export type Domain = typeof DOMAIN[keyof typeof DOMAIN];

// ─── Log entry shape ──────────────────────────────────────────────────────────
export interface ApiLogEntry {
  id:            string;
  created_at:    string;
  user_id:       string | null;
  org_id:        string | null;
  method:        string;
  endpoint:      string;
  domain:        string;
  status:        'ok' | 'error';
  status_code:   number | null;
  duration_ms:   number | null;
  request_body:  Record<string, unknown> | null;
  response_meta: Record<string, unknown> | null;
  error_message: string | null;
  // joined
  profiles?:     { first_name: string; last_name: string } | null;
}

// ─── Core logger ─────────────────────────────────────────────────────────────
interface LoggedQueryOptions<T> {
  domain:       Domain;
  method:       'GET' | 'POST' | 'PATCH' | 'DELETE' | 'UPSERT';
  endpoint:     string;
  orgId?:       string | null;
  userId?:      string | null;
  requestBody?: Record<string, unknown>;
  /** The already-built Supabase query builder (not yet awaited) */
  query:        PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>;
}

export async function loggedQuery<T>(opts: LoggedQueryOptions<T>) {
  const t0 = Date.now();
  const result = await opts.query;
  const duration = Date.now() - t0;

  const isError   = !!result.error;
  const statusCode = isError
    ? (result.error?.code === 'PGRST116' ? 404 : 500)
    : 200;

  // Fire-and-forget insert — never let logging block the UI
  supabase.from('api_request_log').insert({
    user_id:       opts.userId   ?? null,
    org_id:        opts.orgId    ?? null,
    method:        opts.method,
    endpoint:      opts.endpoint,
    domain:        opts.domain,
    status:        isError ? 'error' : 'ok',
    status_code:   statusCode,
    duration_ms:   duration,
    request_body:  (opts.requestBody ?? null) as any,
    response_meta: (isError
      ? { error_code: result.error?.code, message: result.error?.message }
      : { row_count: Array.isArray(result.data) ? result.data.length : (result.data ? 1 : 0) }) as any,
    error_message: result.error?.message ?? null,
  }).then(() => { /* silently drop */ });

  return result;
}

// ─── Simple fire-and-forget log (for auth events, non-query actions) ──────────
export function logEvent(opts: {
  domain:        Domain;
  method:        'GET' | 'POST' | 'PATCH' | 'DELETE' | 'UPSERT';
  endpoint:      string;
  orgId?:        string | null;
  userId?:       string | null;
  status?:       'ok' | 'error';
  statusCode?:   number;
  durationMs?:   number;
  requestBody?:  Record<string, unknown>;
  responseMeta?: Record<string, unknown>;
  errorMessage?: string;
}) {
  supabase.from('api_request_log').insert({
    user_id:       opts.userId      ?? null,
    org_id:        opts.orgId       ?? null,
    method:        opts.method,
    endpoint:      opts.endpoint,
    domain:        opts.domain,
    status:        opts.status      ?? 'ok',
    status_code:   opts.statusCode  ?? (opts.status === 'error' ? 500 : 200),
    duration_ms:   opts.durationMs  ?? null,
    request_body:  (opts.requestBody ?? null) as any,
    response_meta: (opts.responseMeta ?? null) as any,
    error_message: opts.errorMessage ?? null,
  }).then(() => { /* silently drop */ });
}
