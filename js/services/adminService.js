import { supabase } from '../lib/supabaseClient.js';

const ADMIN_LIST_LIMIT = 500;
const RECENT_LOGIN_WINDOW_DAYS = 7;
const SESSION_ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the public project values to .env.local.');
  }
  return supabase;
}

function throwIfError(result, label) {
  if (result.error) {
    throw new Error(label + ': ' + result.error.message);
  }
}

export async function loadAdminData() {
  const client = requireSupabase();
  const recentLoginStart = new Date(Date.now() - RECENT_LOGIN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const activeStart = new Date(Date.now() - SESSION_ACTIVE_WINDOW_MS).toISOString();

  const [profiles, profileCount, sessions, recentLogins, activeSessions] = await Promise.all([
    client.from('profiles')
      .select('id, full_name, email, role, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT),
    client.from('profiles').select('id', { count: 'exact', head: true }),
    client.from('user_sessions')
      .select('id, user_id, login_at, logout_at, last_seen_at', { count: 'exact' })
      .order('login_at', { ascending: false })
      .limit(ADMIN_LIST_LIMIT),
    client.from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .gte('login_at', recentLoginStart),
    client.from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .is('logout_at', null)
      .gte('last_seen_at', activeStart),
  ]);

  throwIfError(profiles, 'Could not load profiles');
  throwIfError(profileCount, 'Could not count profiles');
  throwIfError(sessions, 'Could not load session activity');
  throwIfError(recentLogins, 'Could not count recent logins');
  throwIfError(activeSessions, 'Could not count recent sessions');

  const profilesById = new Map((profiles.data || []).map((profile) => [profile.id, profile]));
  const sessionRows = (sessions.data || []).map((row) => ({
    ...row,
    profile: profilesById.get(row.user_id) || null,
  }));

  return {
    profiles: profiles.data || [],
    profileCount: profileCount.count || 0,
    sessions: sessionRows,
    sessionCount: sessions.count || 0,
    recentLoginCount: recentLogins.count || 0,
    activeSessionCount: activeSessions.count || 0,
    profileRowsLimited: (profileCount.count || 0) > ADMIN_LIST_LIMIT,
    sessionRowsLimited: (sessions.count || 0) > ADMIN_LIST_LIMIT,
    generatedAt: new Date().toISOString(),
  };
}
