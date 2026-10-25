const environment = import.meta.env;

export const supabaseConfig = {
  url: environment.VITE_SUPABASE_URL?.trim() || '',
  anonKey: environment.VITE_SUPABASE_ANON_KEY?.trim() || '',
};

export const supabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
