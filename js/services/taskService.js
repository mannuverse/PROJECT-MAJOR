import { supabase } from '../lib/supabaseClient.js';

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add the public project values to .env.local.');
  }
  return supabase;
}

export async function listTasks() {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .select('id, user_id, title, description, status, priority, due_date, category, created_at, updated_at, completed_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createTask(userId, task) {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .insert({ ...task, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTask(taskId, changes) {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .update(changes)
    .eq('id', taskId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('That task could not be found. Refresh the list and try again.');
  return data;
}

export async function deleteTask(taskId) {
  const { data, error } = await requireSupabase()
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('That task could not be found. Refresh the list and try again.');
}
