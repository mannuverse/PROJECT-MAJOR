import { supabase } from '../lib/supabaseClient.js';

export async function loadProfile(userId) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the public project values to .env.local.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('id', userId)
    .single();

  if (error) throw new Error(`Could not load the account profile: ${error.message}`);
  return data;
}
