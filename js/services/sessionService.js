import { supabase } from '../lib/supabaseClient.js';

export const SESSION_ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const SESSION_STORAGE_PREFIX = 'flowdesk.session-row.';

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the public project values to .env.local.');
  }
  return supabase;
}

function storageKey(userId) {
  return SESSION_STORAGE_PREFIX + userId;
}

export function clearUserSessionPointer(userId) {
  if (!userId) return;
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Session history is best-effort in browsers that block session storage.
  }
}

export async function startUserSession(userId) {
  const client = requireSupabase();
  let existingId = null;
  try {
    existingId = window.sessionStorage.getItem(storageKey(userId));
  } catch {
    // Session storage may be unavailable in a restricted browser; a new row is still safe.
  }

  if (existingId) {
    const { data, error } = await client
      .from('user_sessions')
      .select('id, logout_at, last_seen_at')
      .eq('id', existingId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    const lastSeenAt = data?.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
    const now = Date.now();
    if (data && !data.logout_at && lastSeenAt >= now - SESSION_ACTIVE_WINDOW_MS && lastSeenAt <= now + SESSION_ACTIVE_WINDOW_MS) {
      return data.id;
    }
    try {
      window.sessionStorage.removeItem(storageKey(userId));
    } catch {
      // Ignore storage cleanup failure; the database remains authoritative.
    }
  }

  const { data, error } = await client
    .from('user_sessions')
    .insert({ user_id: userId })
    .select('id')
    .single();

  if (error) throw error;
  try {
    window.sessionStorage.setItem(storageKey(userId), data.id);
  } catch {
    // Tracking continues in memory for this page even if storage is unavailable.
  }
  return data.id;
}

export async function touchUserSession(sessionId) {
  const { data, error } = await requireSupabase().rpc('touch_user_session', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data) throw new Error('The session heartbeat was not accepted.');
}

export async function closeUserSession(sessionId, userId) {
  const { data, error } = await requireSupabase().rpc('close_user_session', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data) throw new Error('The session was already closed or is no longer available.');
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Ignore storage cleanup failure; the database already recorded the logout.
  }
}
