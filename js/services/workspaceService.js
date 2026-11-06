import { supabase } from '../lib/supabaseClient.js';

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

export async function listProjects() {
  const { data, error } = await client().from('projects')
    .select('id, owner_id, name, description, color, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createProject(ownerId, project) {
  const { data, error } = await client().from('projects')
    .insert({ ...project, owner_id: ownerId }).select().single();
  if (error) throw error;
  return data;
}

export async function listProjectMembers(projectId) {
  const { data, error } = await client().rpc('list_project_members', { p_project_id: projectId });
  if (error) throw error;
  return data || [];
}

export async function addProjectMember(projectId, email) {
  const { data, error } = await client().rpc('add_project_member_by_email', {
    p_project_id: projectId,
    p_email: email,
  });
  if (error) throw error;
  return data?.[0] || null;
}

export async function updateMemberCapacity(projectId, userId, capacityHours) {
  const { error } = await client().from('project_members')
    .update({ capacity_hours: capacityHours })
    .eq('project_id', projectId).eq('user_id', userId);
  if (error) throw error;
}

export async function listTaskDependencies() {
  const { data, error } = await client().from('task_dependencies')
    .select('task_id, depends_on_task_id');
  if (error) throw error;
  return data || [];
}

export async function setTaskDependencies(taskId, dependencyIds) {
  const db = client();
  const { error: deleteError } = await db.from('task_dependencies').delete().eq('task_id', taskId);
  if (deleteError) throw deleteError;
  if (!dependencyIds.length) return;
  const { error } = await db.from('task_dependencies').insert(
    dependencyIds.filter((id) => id !== taskId).map((dependsOnId) => ({ task_id: taskId, depends_on_task_id: dependsOnId }))
  );
  if (error) throw error;
}

export async function listTaskDiscussion(taskId) {
  const db = client();
  const [comments, activity, dependencies] = await Promise.all([
    db.from('task_comments').select('id, author_id, body, created_at').eq('task_id', taskId).order('created_at'),
    db.from('task_activity').select('id, actor_id, event_type, details, created_at').eq('task_id', taskId).order('created_at', { ascending: false }).limit(30),
    db.from('task_dependencies').select('task_id, depends_on_task_id').eq('task_id', taskId),
  ]);
  for (const result of [comments, activity, dependencies]) if (result.error) throw result.error;
  return { comments: comments.data || [], activity: activity.data || [], dependencies: dependencies.data || [] };
}

export async function addTaskComment(taskId, body, mentionedUserIds) {
  const { data, error } = await client().rpc('create_task_comment', {
    p_task_id: taskId,
    p_body: body,
    p_mentioned_users: mentionedUserIds,
  });
  if (error) throw error;
  return data;
}

export async function listNotifications() {
  const { data, error } = await client().from('notifications')
    .select('id, task_id, actor_id, notification_type, message, read_at, created_at')
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
}

export async function markNotificationRead(notificationId) {
  const { error } = await client().from('notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', notificationId);
  if (error) throw error;
}

export async function listSavedViews() {
  const { data, error } = await client().from('saved_views')
    .select('id, name, filters, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveView(userId, name, filters) {
  const { data, error } = await client().from('saved_views')
    .insert({ user_id: userId, name, filters }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSavedView(viewId) {
  const { error } = await client().from('saved_views').delete().eq('id', viewId);
  if (error) throw error;
}

