import { createClient } from '@supabase/supabase-js';
import { supabaseConfig, supabaseConfigured } from '../config.js';

export let supabase = null;
export let supabaseClientError = null;

if (supabaseConfigured) {
  try {
    supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  } catch (error) {
    supabaseClientError = error instanceof Error
      ? `Supabase configuration is invalid: ${error.message}`
      : 'Supabase configuration is invalid. Check the URL and public key.';
  }
}
