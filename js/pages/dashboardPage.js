function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(label, className, onClick, disabled = false) {
  const button = element('button', className, label);
  button.type = 'button';
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function localDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
    .format(new Date(dateValue + 'T12:00:00'));
}

function statusLabel(status) {
  return { todo: 'To do', in_progress: 'In progress', done: 'Completed' }[status] || status;
}

function renderMetric(label, value, detail, accent) {
  const card = element('article', 'metric-card metric-' + accent);
  card.append(element('span', 'metric-label', label), element('strong', 'metric-value', String(value)));
  card.append(element('span', 'metric-detail', detail));
  return card;
}

function renderTaskRow(task) {
  const row = element('article', 'dashboard-task-row');
  const copy = element('div', 'dashboard-task-copy');
  copy.append(element('h3', 'dashboard-task-title', task.title));
  if (task.category) copy.append(element('span', 'dashboard-task-category', task.category));
  const meta = element('div', 'dashboard-task-meta');
  meta.append(
    element('span', 'task-status status-' + task.status, statusLabel(task.status)),
    element('span', 'dashboard-task-date', formatDate(task.due_date))
  );
  row.append(copy, meta);
  return row;
}

function renderTaskGroup({ title, kicker, tasks, emptyMessage }) {
  const section = element('section', 'surface dashboard-task-panel');
  const header = element('div', 'dashboard-panel-heading');
  const copy = element('div', 'dashboard-panel-copy');
  copy.append(element('p', 'section-kicker', kicker), element('h2', 'section-title', title));
  const list = element('div', 'dashboard-task-list');
  if (tasks.length) {
    for (const task of tasks) list.append(renderTaskRow(task));
  } else {
    list.append(element('p', 'dashboard-empty-note', emptyMessage));
  }
  header.append(copy);
  section.append(header, list);
  return section;
}

export function renderDashboardPage({
  profile, email, tasks, loading, error, feedback, activityNotice, pending, onNavigate, onSignOut, onRetry,
}) {
  const shell = element('div', 'workspace-shell');
  const sidebar = element('aside', 'workspace-sidebar');
  const brand = element('div', 'workspace-brand');
  brand.append(element('span', 'brand-mark', 'F'), element('span', '', 'FlowDesk'));
  sidebar.append(brand);

  const nav = element('nav', 'workspace-nav');
  nav.append(element('span', 'sidebar-label', 'WORKSPACE'));
  const overviewButton = makeButton('Overview', 'workspace-nav-item workspace-nav-active', () => onNavigate('overview'), pending);
  overviewButton.setAttribute('aria-current', 'page');
  const tasksButton = makeButton('My Tasks', 'workspace-nav-item', () => onNavigate('tasks'), pending);
  nav.append(overviewButton, tasksButton);
  if (profile.role === 'admin') {
    nav.append(makeButton('Admin', 'workspace-nav-item', () => onNavigate('admin'), pending));
  }
  sidebar.append(nav, element('p', 'sidebar-note', 'A clear view of your personal work.'));

  const content = element('div', 'workspace-content');
  const topbar = element('header', 'workspace-topbar');
  topbar.append(element('span', 'topbar-context', 'Personal workspace'));
  const account = element('div', 'topbar-account');
  const accountCopy = element('div', 'account-copy');
  accountCopy.append(
    element('span', 'account-name', profile.full_name || email),
    element('span', 'account-email', email),
    element('span', 'account-role', profile.role + ' account')
  );
  account.append(
    accountCopy,
    makeButton(pending ? 'Signing out…' : 'Sign out', 'button button-secondary button-small', () => void onSignOut(), pending)
  );
  topbar.append(account);

  const page = element('main', 'dashboard-page');
  const heading = element('div', 'page-heading dashboard-heading');
  const intro = element('div', 'page-heading-copy');
  intro.append(
    element('p', 'eyebrow', 'FLOWDESK · OVERVIEW'),
    element('h1', 'page-title', 'Your work, at a glance'),
    element('p', 'page-description', 'A focused snapshot of the tasks in your personal workspace.')
  );
  heading.append(intro, makeButton('＋  Create a task', 'button button-primary quick-create-button', () => onNavigate('create'), pending));
  page.append(heading);

  if (feedback) {
    const notice = element('p', 'feedback ' + (feedback.type === 'error' ? 'feedback-error' : 'feedback-success'), feedback.message);
    notice.setAttribute('role', feedback.type === 'error' ? 'alert' : 'status');
    page.append(notice);
  }
  if (activityNotice) {
    const notice = element('p', 'activity-notice', activityNotice);
    notice.setAttribute('role', 'status');
    page.append(notice);
  }

  if (loading) {
    page.append(element('div', 'dashboard-load-state', 'Loading your task summary…'));
  } else if (error) {
    const errorPanel = element('section', 'surface dashboard-error');
    errorPanel.append(
      element('p', 'feedback feedback-error', 'Your task summary could not be loaded. ' + error),
      makeButton('Try again', 'button button-secondary', onRetry, pending)
    );
    page.append(errorPanel);
  } else {
    const today = localDateString();
    const dueToday = tasks.filter((task) => task.due_date === today);
    const inProgress = tasks.filter((task) => task.status === 'in_progress');
    const completed = tasks.filter((task) => task.status === 'done');
    const overdue = tasks.filter((task) => task.status !== 'done' && task.due_date && task.due_date < today);
    const todayTasks = dueToday.sort((left, right) => left.created_at.localeCompare(right.created_at));
    const upcoming = tasks
      .filter((task) => task.status !== 'done' && task.due_date && task.due_date > today)
      .sort((left, right) => left.due_date.localeCompare(right.due_date))
      .slice(0, 5);

    const metrics = element('section', 'dashboard-metrics');
    metrics.setAttribute('aria-label', 'Task summary');
    metrics.append(
      renderMetric('Due today', dueToday.length, 'Tasks with today’s due date', 'blue'),
      renderMetric('In progress', inProgress.length, 'Currently being worked on', 'violet'),
      renderMetric('Completed', completed.length, 'Completed tasks', 'green'),
      renderMetric('Overdue', overdue.length, 'Unfinished past-due tasks', 'rose')
    );
    page.append(metrics);

    const progressPanel = element('section', 'surface completion-panel');
    const progressCopy = element('div', 'completion-copy');
    progressCopy.append(
      element('p', 'section-kicker', 'PROGRESS'),
      element('h2', 'section-title', 'Task completion'),
      element('p', 'completion-description', tasks.length
        ? completed.length + ' of ' + tasks.length + ' tasks are complete.'
        : 'Add a task to start tracking your progress.')
    );
    const percent = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
    const progressTrack = element('div', 'progress-track');
    progressTrack.setAttribute('role', 'progressbar');
    progressTrack.setAttribute('aria-label', 'Tasks completed');
    progressTrack.setAttribute('aria-valuemin', '0');
    progressTrack.setAttribute('aria-valuemax', '100');
    progressTrack.setAttribute('aria-valuenow', String(percent));
    const progressValue = element('span', 'progress-value');
    progressValue.style.width = percent + '%';
    progressTrack.append(progressValue);
    const progressPercent = element('strong', 'progress-percent', percent + '%');
    progressPanel.append(progressCopy, progressTrack, progressPercent);
    page.append(progressPanel);

    const taskGroups = element('div', 'dashboard-task-groups');
    taskGroups.append(
      renderTaskGroup({
        title: 'Due today',
        kicker: 'TODAY',
        tasks: todayTasks.slice(0, 5),
        emptyMessage: 'Nothing is due today. You have room to plan ahead.',
      }),
      renderTaskGroup({
        title: 'Coming up',
        kicker: 'UP NEXT',
        tasks: upcoming,
        emptyMessage: 'No upcoming due dates. Add dates to tasks when you are ready.',
      })
    );
    page.append(taskGroups);

    if (!tasks.length) {
      const empty = element('section', 'dashboard-empty-banner');
      empty.append(
        element('h2', '', 'Start with one next step'),
        element('p', '', 'Your task summaries will appear here as you add real tasks to your account.')
      );
      empty.append(makeButton('Add your first task', 'button button-secondary', () => onNavigate('create'), pending));
      page.append(empty);
    } else {
      page.append(makeButton('View all tasks', 'button button-secondary dashboard-view-all', () => onNavigate('tasks'), pending));
    }
  }

  page.append(element('footer', 'workspace-footer', 'FlowDesk · Team Productivity Dashboard'));
  content.append(topbar, page);
  shell.append(sidebar, content);
  return shell;
}
