import './base.css';
import { supabaseConfigured } from './js/config.js';
import { supabase, supabaseClientError } from './js/lib/supabaseClient.js';
import {
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from './js/services/authService.js';
import { loadProfile } from './js/services/profileService.js';
import { renderAuthPage } from './js/pages/authPage.js';
import { renderAdminPage } from './js/pages/adminPage.js';
import { renderDashboardPage } from './js/pages/dashboardPage.js';
import { renderTasksPage } from './js/pages/tasksPage.js';
import { loadAdminData as fetchAdminData } from './js/services/adminService.js';
import { clearUserSessionPointer, closeUserSession, startUserSession, touchUserSession } from './js/services/sessionService.js';
import { createTask, deleteTask, listTasks, updateTask } from './js/services/taskService.js';

const app = document.querySelector('#app');

if (!app) {
  throw new Error('The application root element (#app) was not found.');
}

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function replaceAppContent(content) {
  const focused = document.activeElement;
  const focusKey = focused?.dataset?.focusKey;
  const selectionStart = focused instanceof HTMLInputElement ? focused.selectionStart : null;
  const selectionEnd = focused instanceof HTMLInputElement ? focused.selectionEnd : null;
  app.replaceChildren(content);
  if (focusKey) {
    const replacement = app.querySelector('[data-focus-key="' + focusKey + '"]');
    replacement?.focus();
    if (replacement instanceof HTMLInputElement && selectionStart !== null && selectionEnd !== null) {
      replacement.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

let authMode = 'signIn';
let session = null;
let profile = null;
let feedback = null;
let profileError = null;
let profileLoading = true;
let pending = false;
let passwordRecovery = false;
let sessionRevision = 0;
let tasks = [];
let tasksLoading = false;
let tasksError = null;
let taskFeedback = null;
let taskPending = false;
let editingTaskId = null;
let taskDraft = {};
let taskFilters = { search: '', status: 'all', priority: 'all', sort: 'created_desc' };
let currentView = 'overview';
let activityNotice = null;
let trackedSessionUserId = null;
let trackedSessionRowId = null;
let sessionStartPromise = null;
let heartbeatTimer = null;
let heartbeatPending = false;
let adminData = null;
let adminLoading = false;
let adminError = null;
let adminTab = 'profiles';
let adminFilters = {
  profileSearch: '', profileRole: 'all', profilePage: 1,
  sessionUser: 'all', sessionFrom: '', sessionTo: '', sessionPage: 1,
};

function renderConfigurationError() {
  const panel = element('main', 'welcome-panel auth-card');
  panel.setAttribute('aria-labelledby', 'config-title');
  const title = element('h1', 'auth-title', 'Connect your Supabase project.');
  title.id = 'config-title';
  panel.append(
    element('p', 'eyebrow', 'FLOWDESK · SETUP'),
    title,
    element(
      'p',
      'auth-description',
      supabaseClientError || 'Authentication needs the public project URL and anon/publishable key.'
    )
  );

  const instructions = element('div', 'configuration-help');
  instructions.append(
    element('p', '', 'In this project folder, run:'),
    element('code', 'command-line', 'Copy-Item .env.example .env.local'),
    element(
      'p',
      '',
      'Open .env.local, fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from Supabase, then restart npm run dev.'
    ),
    element('p', 'muted-copy', 'Use only the public anon/publishable key here. Never use a service-role key.')
  );
  panel.append(instructions);
  replaceAppContent(panel);
}

function renderLoading() {
  const panel = element('main', 'welcome-panel auth-card loading-card');
  panel.setAttribute('role', 'status');
  panel.append(
    element('p', 'eyebrow', 'FLOWDESK'),
    element('h1', 'auth-title', 'Checking your session…'),
    element('p', 'auth-description', 'Your account profile is loading.')
  );
  replaceAppContent(panel);
}

function renderProfileError() {
  const panel = element('main', 'welcome-panel auth-card');
  panel.setAttribute('aria-labelledby', 'profile-error-title');
  const title = element('h1', 'auth-title', 'Your profile could not be loaded.');
  title.id = 'profile-error-title';
  panel.append(
    element('p', 'eyebrow', 'FLOWDESK · ACCOUNT'),
    title,
    element(
      'p',
      'feedback feedback-error',
      profileError || 'Check that the database schema and profile policies are installed.'
    )
  );

  const actions = element('div', 'button-row');
  const retryButton = element('button', 'button button-primary', 'Try again');
  retryButton.type = 'button';
  retryButton.disabled = pending;
  retryButton.addEventListener('click', () => void retryProfileLoad());

  const signOutButton = element('button', 'button button-secondary', pending ? 'Please wait…' : 'Sign out');
  signOutButton.type = 'button';
  signOutButton.disabled = pending;
  signOutButton.addEventListener('click', () => void handleSignOut());
  actions.append(retryButton, signOutButton);
  panel.append(actions);
  app.replaceChildren(panel);
}

function render() {
  if (!supabaseConfigured || !supabase) {
    renderConfigurationError();
    return;
  }

  if (passwordRecovery) {
    replaceAppContent(
      renderAuthPage({ mode: 'updatePassword', feedback, pending, onModeChange: changeAuthMode, onSubmit: handleAuthSubmit })
    );
    return;
  }

  if (session?.user) {
    if (profileLoading) {
      renderLoading();
      return;
    }
    if (profileError || !profile) {
      renderProfileError();
      return;
    }

    const pageProps = {
        profile,
        email: session.user.email || '',
        tasks,
        loading: tasksLoading,
        error: tasksError,
        feedback: taskFeedback,
        activityNotice,
        pending: pending || taskPending,
        filters: taskFilters,
        editingTask: tasks.find((task) => task.id === editingTaskId) || null,
        formValues: taskDraft,
        onSignOut: handleSignOut,
        onRetry: () => void loadTasks(),
        onSaveTask: handleTaskSave,
        onCancelEdit: cancelTaskEdit,
        onEdit: startTaskEdit,
        onToggleComplete: handleToggleComplete,
        onDelete: handleDeleteTask,
        onFiltersChange: handleFiltersChange,
        onClearFilters: clearTaskFilters,
        onNavigate: handleNavigate,
      };
    if (currentView === 'admin' && profile.role === 'admin') {
      replaceAppContent(renderAdminPage({
        profile,
        email: session.user.email || '',
        data: adminData,
        loading: adminLoading,
        error: adminError,
        feedback: taskFeedback,
        activityNotice,
        pending: pending || taskPending,
        tab: adminTab,
        filters: adminFilters,
        onNavigate: handleNavigate,
        onSignOut: handleSignOut,
        onRetry: () => void loadAdminData(),
        onTabChange: handleAdminTabChange,
        onFiltersChange: handleAdminFiltersChange,
      }));
    } else if (currentView === 'overview') {
      replaceAppContent(renderDashboardPage({ ...pageProps, onRetry: () => void loadTasks() }));
    } else {
      replaceAppContent(renderTasksPage(pageProps));
    }
    return;
  }

  replaceAppContent(
    renderAuthPage({ mode: authMode, feedback, pending, onModeChange: changeAuthMode, onSubmit: handleAuthSubmit })
  );
}

function changeAuthMode(mode) {
  authMode = mode;
  feedback = null;
  render();
}

async function setSession(nextSession) {
  const currentRevision = ++sessionRevision;
  session = nextSession;
  profile = null;
  profileError = null;
  tasks = [];
  tasksError = null;
  tasksLoading = false;
  taskFeedback = null;
  editingTaskId = null;
  taskDraft = {};
  taskFilters = { search: '', status: 'all', priority: 'all', sort: 'created_desc' };
  currentView = 'overview';
  activityNotice = null;
  adminData = null;
  adminLoading = false;
  adminError = null;
  adminTab = 'profiles';
  adminFilters = {
    profileSearch: '', profileRole: 'all', profilePage: 1,
    sessionUser: 'all', sessionFrom: '', sessionTo: '', sessionPage: 1,
  };

  if (nextSession?.user && !passwordRecovery) {
    void ensureSessionTracking(nextSession.user.id, currentRevision);
  } else {
    stopSessionHeartbeat();
    clearUserSessionPointer(trackedSessionUserId);
    trackedSessionUserId = null;
    trackedSessionRowId = null;
    sessionStartPromise = null;
  }

  if (!nextSession?.user || passwordRecovery) {
    profileLoading = false;
    render();
    return;
  }

  profileLoading = true;
  render();

  let loadedProfile = null;
  let loadError = null;
  try {
    loadedProfile = await loadProfile(nextSession.user.id);
  } catch (error) {
    loadError = error instanceof Error
      ? error.message
      : 'Check the profiles table, profile trigger, and row security policies.';
  }

  if (currentRevision !== sessionRevision) return;
  profile = loadedProfile;
  profileError = loadError;
  profileLoading = false;
  if (profile && !profileError) {
    tasksLoading = true;
    render();
    try {
      tasks = await listTasks();
    } catch (error) {
      if (currentRevision !== sessionRevision) return;
      tasksError = error instanceof Error ? error.message : 'Tasks could not be loaded.';
    } finally {
      if (currentRevision === sessionRevision) {
        tasksLoading = false;
        render();
      }
    }
    return;
  }
  render();
}

function handleFiltersChange(nextFilters) {
  taskFilters = nextFilters;
  render();
}

function handleNavigate(view) {
  if (view === 'admin') {
    if (profile?.role !== 'admin') {
      currentView = 'overview';
      render();
      return;
    }
    currentView = 'admin';
    render();
    void loadAdminData();
    return;
  }
  currentView = view === 'create' || view === 'tasks' ? 'tasks' : 'overview';
  if (view === 'create') {
    editingTaskId = null;
    taskDraft = {};
    taskFeedback = null;
  }
  render();
  if (view === 'create') document.querySelector('[data-focus-key="task-title"]')?.focus();
}

function handleAdminTabChange(tab) {
  if (tab !== 'profiles' && tab !== 'sessions') return;
  adminTab = tab;
  render();
}

function handleAdminFiltersChange(nextFilters) {
  adminFilters = nextFilters;
  render();
}

async function loadAdminData() {
  if (profile?.role !== 'admin' || adminLoading) return;
  adminLoading = true;
  adminError = null;
  render();
  try {
    adminData = await fetchAdminData();
  } catch (error) {
    adminError = error instanceof Error ? error.message : 'Administrative data could not be loaded.';
  } finally {
    adminLoading = false;
    render();
  }
}

function clearTaskFilters() {
  taskFilters = { search: '', status: 'all', priority: 'all', sort: 'created_desc' };
  render();
}

function startTaskEdit(task) {
  editingTaskId = task.id;
  taskDraft = {};
  taskFeedback = null;
  render();
  document.querySelector('[data-focus-key="task-title"]')?.focus();
}

function cancelTaskEdit() {
  editingTaskId = null;
  taskDraft = {};
  taskFeedback = null;
  render();
}

function taskFieldsFromForm(formData) {
  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const category = String(formData.get('category') || '').trim();
  const status = String(formData.get('status') || 'todo');
  const priority = String(formData.get('priority') || 'medium');
  const dueDate = String(formData.get('due_date') || '').trim();
  if (!title) throw new Error('Enter a task title.');
  if (title.length > 180) throw new Error('Task titles can be up to 180 characters.');
  if (description.length > 2000) throw new Error('Descriptions can be up to 2,000 characters.');
  if (category.length > 80) throw new Error('Categories can be up to 80 characters.');
  if (!['todo', 'in_progress', 'done'].includes(status)) throw new Error('Choose a valid task status.');
  if (!['low', 'medium', 'high'].includes(priority)) throw new Error('Choose a valid priority.');
  return {
    title,
    description,
    category: category || null,
    status,
    priority,
    due_date: dueDate || null,
    completed_at: status === 'done'
      ? (tasks.find((task) => task.id === editingTaskId)?.completed_at || new Date().toISOString())
      : null,
  };
}

async function refreshTasks() {
  tasks = await listTasks();
  tasksError = null;
}

async function loadTasks() {
  if (!session?.user || taskPending) return;
  taskPending = true;
  tasksLoading = true;
  tasksError = null;
  render();
  try {
    await refreshTasks();
  } catch (error) {
    tasksError = error instanceof Error ? error.message : 'Tasks could not be loaded.';
  } finally {
    taskPending = false;
    tasksLoading = false;
    render();
  }
}

async function handleTaskSave(formData) {
  taskDraft = Object.fromEntries(formData.entries());
  taskFeedback = null;
  taskPending = true;
  render();
  try {
    const taskFields = taskFieldsFromForm(formData);
    if (editingTaskId) {
      await updateTask(editingTaskId, taskFields);
      taskFeedback = { type: 'success', message: 'Task updated.' };
    } else {
      await createTask(session.user.id, taskFields);
      taskFeedback = { type: 'success', message: 'Task added.' };
    }
    editingTaskId = null;
    taskDraft = {};
    await refreshTasks();
  } catch (error) {
    taskFeedback = {
      type: 'error',
      message: error instanceof Error ? error.message : 'The task could not be saved.',
    };
  } finally {
    taskPending = false;
    render();
  }
}

async function handleToggleComplete(task) {
  taskPending = true;
  taskFeedback = null;
  render();
  const status = task.status === 'done' ? 'todo' : 'done';
  try {
    await updateTask(task.id, {
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    });
    taskFeedback = { type: 'success', message: status === 'done' ? 'Task completed.' : 'Task reopened.' };
    await refreshTasks();
  } catch (error) {
    taskFeedback = {
      type: 'error',
      message: error instanceof Error ? error.message : 'The task could not be updated.',
    };
  } finally {
    taskPending = false;
    render();
  }
}

async function handleDeleteTask(task) {
  if (!window.confirm('Delete “' + task.title + '”? This cannot be undone.')) return;
  taskPending = true;
  taskFeedback = null;
  render();
  try {
    await deleteTask(task.id);
    if (editingTaskId === task.id) cancelTaskEdit();
    taskFeedback = { type: 'success', message: 'Task deleted.' };
    await refreshTasks();
  } catch (error) {
    taskFeedback = {
      type: 'error',
      message: error instanceof Error ? error.message : 'The task could not be deleted.',
    };
  } finally {
    taskPending = false;
    render();
  }
}

function stopSessionHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startSessionHeartbeat(sessionId) {
  stopSessionHeartbeat();
  heartbeatTimer = window.setInterval(() => void sendSessionHeartbeat(sessionId), 60_000);
}

async function sendSessionHeartbeat(sessionId) {
  if (heartbeatPending || !sessionId) return;
  heartbeatPending = true;
  try {
    await touchUserSession(sessionId);
    if (activityNotice) {
      activityNotice = null;
      render();
    }
  } catch (error) {
    activityNotice = 'Session activity could not be updated. The task app is still available; admin status may become stale.';
    render();
  } finally {
    heartbeatPending = false;
  }
}

async function ensureSessionTracking(userId, revision) {
  if (trackedSessionUserId === userId && (trackedSessionRowId || sessionStartPromise)) return;
  if (trackedSessionUserId && trackedSessionUserId !== userId) {
    clearUserSessionPointer(trackedSessionUserId);
    stopSessionHeartbeat();
  }

  trackedSessionUserId = userId;
  activityNotice = null;
  const startPromise = startUserSession(userId);
  sessionStartPromise = startPromise;
  try {
    const rowId = await startPromise;
    if (revision !== sessionRevision || session?.user?.id !== userId) {
      clearUserSessionPointer(userId);
      return;
    }
    trackedSessionRowId = rowId;
    startSessionHeartbeat(rowId);
  } catch (error) {
    if (revision === sessionRevision) {
      activityNotice = 'Session activity could not be recorded. The task app is still available.';
      render();
    }
  } finally {
    if (sessionStartPromise === startPromise) sessionStartPromise = null;
  }
}

window.addEventListener('pagehide', stopSessionHeartbeat);
window.addEventListener('pageshow', () => {
  if (session?.user && trackedSessionRowId) startSessionHeartbeat(trackedSessionRowId);
});

async function retryProfileLoad() {
  if (session?.user) await setSession(session);
}

async function handleAuthSubmit(mode, formData) {
  pending = true;
  feedback = null;
  render();

  try {
    if (mode === 'signUp') {
      const fullName = String(formData.get('fullName') || '').trim();
      if (!fullName) throw new Error('Enter your name to create the account.');

      const result = await signUp({
        fullName,
        email: String(formData.get('email') || '').trim(),
        password: String(formData.get('password') || ''),
      });
      if (!result.session) {
        feedback = {
          type: 'success',
          message: 'Account created. Check your email to confirm it, then sign in.',
        };
      }
    } else if (mode === 'signIn') {
      await signIn({
        email: String(formData.get('email') || '').trim(),
        password: String(formData.get('password') || ''),
      });
    } else if (mode === 'resetRequest') {
      await requestPasswordReset(String(formData.get('email') || '').trim());
      feedback = {
        type: 'success',
        message: 'If an account uses that email, a reset link will be sent.',
      };
    } else if (mode === 'updatePassword') {
      const newPassword = String(formData.get('password') || '');
      const confirmation = String(formData.get('confirmPassword') || '');
      if (newPassword !== confirmation) throw new Error('The passwords do not match.');
      await updatePassword(newPassword);
      passwordRecovery = false;
      authMode = 'signIn';
      feedback = { type: 'success', message: 'Password updated successfully.' };
      void setSession(session);
    }
  } catch (error) {
    feedback = {
      type: 'error',
      message: error instanceof Error ? error.message : 'The request could not be completed.',
    };
  } finally {
    pending = false;
    render();
  }
}

async function handleSignOut() {
  pending = true;
  feedback = null;
  render();
  const userId = session?.user?.id || null;
  const rowId = trackedSessionRowId;
  let sessionCloseFailed = false;
  stopSessionHeartbeat();
  try {
    if (rowId && userId) {
      try {
        await closeUserSession(rowId, userId);
      } catch {
        sessionCloseFailed = true;
      }
    }
    await signOut();
    clearUserSessionPointer(userId);
    trackedSessionUserId = null;
    trackedSessionRowId = null;
    sessionStartPromise = null;
    if (sessionCloseFailed) {
      feedback = {
        type: 'error',
        message: 'You signed out, but FlowDesk could not record the session end. The session will appear stale after its heartbeat expires.',
      };
    }
  } catch (error) {
    const message = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Sign out failed. Please try again.',
    };
    if (session?.user) taskFeedback = message;
    else feedback = message;
    if (userId && sessionCloseFailed && rowId) {
      trackedSessionRowId = rowId;
      startSessionHeartbeat(rowId);
    } else if (userId && rowId) {
      try {
        trackedSessionRowId = await startUserSession(userId);
        startSessionHeartbeat(trackedSessionRowId);
      } catch {
        activityNotice = 'Sign out failed and session tracking could not be restarted.';
      }
    }
  } finally {
    pending = false;
    render();
  }
}

if (supabase) {
  renderLoading();
  supabase.auth.onAuthStateChange((event, nextSession) => {
    if (event === 'PASSWORD_RECOVERY') {
      passwordRecovery = true;
      authMode = 'updatePassword';
      feedback = null;
    } else if (event === 'SIGNED_OUT') {
      passwordRecovery = false;
      authMode = 'signIn';
    } else if (event === 'USER_UPDATED' && passwordRecovery) {
      passwordRecovery = false;
      authMode = 'signIn';
      feedback = { type: 'success', message: 'Password updated successfully.' };
    }

    queueMicrotask(() => void setSession(nextSession));
  });
} else {
  renderConfigurationError();
}
