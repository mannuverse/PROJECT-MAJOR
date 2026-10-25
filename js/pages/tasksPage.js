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

function addSelectField(container, { labelText, name, options, value, focusKey }) {
  const field = element('label', 'form-field task-field');
  field.append(element('span', 'field-label', labelText));
  const select = document.createElement('select');
  select.name = name;
  select.setAttribute('aria-label', labelText);
  if (focusKey) select.dataset.focusKey = focusKey;
  for (const [optionValue, optionText] of options) {
    const option = element('option', '', optionText);
    option.value = optionValue;
    select.append(option);
  }
  select.value = value;
  field.append(select);
  container.append(field);
  return select;
}

function addInputField(container, { labelText, name, type = 'text', value = '', required = false, maxLength, placeholder, focusKey }) {
  const field = element('label', 'form-field task-field');
  field.append(element('span', 'field-label', labelText));
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.value = value || '';
  input.required = required;
  if (maxLength) input.maxLength = maxLength;
  if (placeholder) input.placeholder = placeholder;
  if (focusKey) input.dataset.focusKey = focusKey;
  field.append(input);
  container.append(field);
  return input;
}

function formatDate(dateValue) {
  if (!dateValue) return 'No due date';
  const date = new Date(dateValue + 'T12:00:00');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function todayLocalDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return now.getFullYear() + '-' + month + '-' + day;
}

function taskMatchesFilters(task, filters) {
  const query = filters.search.trim().toLocaleLowerCase();
  return (!query || task.title.toLocaleLowerCase().includes(query))
    && (filters.status === 'all' || task.status === filters.status)
    && (filters.priority === 'all' || task.priority === filters.priority);
}

function sortTasks(tasks, sort) {
  return [...tasks].sort((left, right) => {
    if (sort === 'due_asc') {
      if (!left.due_date && !right.due_date) return right.created_at.localeCompare(left.created_at);
      if (!left.due_date) return 1;
      if (!right.due_date) return -1;
      return left.due_date.localeCompare(right.due_date);
    }
    if (sort === 'created_asc') return left.created_at.localeCompare(right.created_at);
    return right.created_at.localeCompare(left.created_at);
  });
}

function renderTaskCard(task, { pending, onEdit, onToggleComplete, onDelete }) {
  const card = element('article', 'task-card' + (task.status === 'done' ? ' task-card-done' : ''));
  const main = element('div', 'task-card-main');
  const titleLine = element('div', 'task-title-line');
  titleLine.append(element('h3', 'task-title', task.title));
  const statusLabels = { todo: 'To do', in_progress: 'In progress', done: 'Completed' };
  titleLine.append(element('span', 'task-status status-' + task.status, statusLabels[task.status] || task.status));
  main.append(titleLine);

  if (task.description) main.append(element('p', 'task-description', task.description));

  const metadata = element('div', 'task-metadata');
  metadata.append(element('span', 'priority-chip priority-' + task.priority, task.priority + ' priority'));
  if (task.category) metadata.append(element('span', 'task-category', task.category));
  if (task.due_date) {
    const overdue = task.status !== 'done' && task.due_date < todayLocalDate();
    metadata.append(element('span', 'task-due' + (overdue ? ' task-overdue' : ''), (overdue ? 'Overdue · ' : 'Due · ') + formatDate(task.due_date)));
  } else {
    metadata.append(element('span', 'task-due', 'No due date'));
  }
  main.append(metadata);

  const actions = element('div', 'task-actions');
  actions.append(
    makeButton('Edit', 'button button-secondary button-small', () => onEdit(task), pending),
    makeButton(task.status === 'done' ? 'Reopen' : 'Complete', 'button button-secondary button-small', () => onToggleComplete(task), pending),
    makeButton('Delete', 'button button-danger button-small', () => onDelete(task), pending)
  );
  card.append(main, actions);
  return card;
}

export function renderTasksPage({
  profile, email, tasks, loading, error, feedback, activityNotice, pending, filters, editingTask,
  formValues, onSignOut, onRetry, onSaveTask, onCancelEdit, onEdit, onToggleComplete,
  onDelete, onFiltersChange, onClearFilters, onNavigate,
}) {
  const shell = element('div', 'workspace-shell');
  const sidebar = element('aside', 'workspace-sidebar');
  const brand = element('div', 'workspace-brand');
  brand.append(element('span', 'brand-mark', 'F'), element('span', '', 'FlowDesk'));
  sidebar.append(brand);
  const nav = element('nav', 'workspace-nav');
  nav.append(element('span', 'sidebar-label', 'WORKSPACE'));
  const overviewButton = makeButton('Overview', 'workspace-nav-item', () => onNavigate('overview'), pending);
  const tasksButton = makeButton('My Tasks', 'workspace-nav-item workspace-nav-active', () => onNavigate('tasks'), pending);
  tasksButton.setAttribute('aria-current', 'page');
  nav.append(overviewButton, tasksButton);
  if (profile.role === 'admin') {
    nav.append(makeButton('Admin', 'workspace-nav-item', () => onNavigate('admin'), pending));
  }
  sidebar.append(nav, element('p', 'sidebar-note', 'Private tasks, saved to your FlowDesk account.'));

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
  const signOutButton = makeButton(pending ? 'Signing out…' : 'Sign out', 'button button-secondary button-small', () => void onSignOut(), pending);
  account.append(accountCopy, signOutButton);
  topbar.append(account);

  const page = element('main', 'task-page');
  const heading = element('div', 'page-heading');
  const intro = element('div', 'page-heading-copy');
  intro.append(
    element('p', 'eyebrow', 'FLOWDESK · YOUR WORK'),
    element('h1', 'page-title', 'My tasks'),
    element('p', 'page-description', 'Keep your next steps clear. Your tasks are private to your account.')
  );
  const taskCount = tasks.length;
  const completedCount = tasks.filter((task) => task.status === 'done').length;
  const countPill = element('div', 'task-count-pill');
  countPill.append(element('strong', '', String(taskCount)), element('span', '', (taskCount === 1 ? 'task' : 'tasks') + ' · ' + completedCount + ' completed'));
  heading.append(intro, countPill);
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

  const editor = element('section', 'surface task-editor');
  editor.setAttribute('aria-labelledby', 'task-form-title');
  const editorHeading = element('div', 'section-heading');
  const editorHeadingCopy = element('div', '');
  editorHeadingCopy.append(
    element('p', 'section-kicker', editingTask ? 'UPDATE YOUR PLAN' : 'CAPTURE A NEXT STEP'),
    element('h2', 'section-title', editingTask ? 'Edit task' : 'Add a task')
  );
  editorHeadingCopy.querySelector('h2').id = 'task-form-title';
  editorHeading.append(editorHeadingCopy);
  editor.append(editorHeading);

  const form = document.createElement('form');
  form.className = 'task-form';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void onSaveTask(new FormData(form));
  });

  const firstRow = element('div', 'task-form-grid task-form-primary');
  addInputField(firstRow, {
    labelText: 'Task title', name: 'title', value: formValues.title ?? editingTask?.title ?? '',
    required: true, maxLength: 180, placeholder: 'What needs to get done?', focusKey: 'task-title',
  });
  addInputField(firstRow, {
    labelText: 'Category / project', name: 'category', value: formValues.category ?? editingTask?.category ?? '',
    maxLength: 80, placeholder: 'For example, Research',
  });
  form.append(firstRow);

  const descriptionField = element('label', 'form-field task-field');
  descriptionField.append(element('span', 'field-label', 'Description (optional)'));
  const description = document.createElement('textarea');
  description.name = 'description';
  description.rows = 3;
  description.maxLength = 2000;
  description.placeholder = 'Add a little context or a useful next step.';
  description.value = formValues.description ?? editingTask?.description ?? '';
  descriptionField.append(description);
  form.append(descriptionField);

  const secondRow = element('div', 'task-form-grid task-form-secondary');
  addSelectField(secondRow, {
    labelText: 'Status', name: 'status', value: formValues.status ?? editingTask?.status ?? 'todo',
    options: [['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Completed']],
  });
  addSelectField(secondRow, {
    labelText: 'Priority', name: 'priority', value: formValues.priority ?? editingTask?.priority ?? 'medium',
    options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']],
  });
  addInputField(secondRow, {
    labelText: 'Due date (optional)', name: 'due_date', type: 'date', value: formValues.due_date ?? editingTask?.due_date ?? '',
  });
  form.append(secondRow);

  const formActions = element('div', 'task-form-actions');
  const saveButton = element('button', 'button button-primary', pending ? 'Saving…' : editingTask ? 'Save changes' : 'Add task');
  saveButton.type = 'submit';
  saveButton.disabled = pending;
  formActions.append(saveButton);
  if (editingTask) formActions.append(makeButton('Cancel', 'button button-secondary', onCancelEdit, pending));
  form.append(formActions);
  editor.append(form);
  page.append(editor);

  const taskSection = element('section', 'tasks-section');
  const listHeader = element('div', 'list-section-heading');
  const listHeadingCopy = element('div', '');
  listHeadingCopy.append(
    element('p', 'section-kicker', 'MANAGE YOUR WORK'),
    element('h2', 'section-title', 'Your task list')
  );
  listHeader.append(listHeadingCopy);
  taskSection.append(listHeader);

  const toolbar = element('div', 'task-toolbar');
  const searchField = element('label', 'form-field toolbar-search');
  searchField.append(element('span', 'field-label', 'Search by title'));
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Find a task';
  searchInput.value = filters.search;
  searchInput.setAttribute('aria-label', 'Search tasks by title');
  searchInput.dataset.focusKey = 'task-search';
  searchInput.addEventListener('input', () => onFiltersChange({ ...filters, search: searchInput.value }));
  searchField.append(searchInput);
  toolbar.append(searchField);

  const statusFilter = addSelectField(toolbar, {
    labelText: 'Status', name: 'statusFilter', value: filters.status, focusKey: 'status-filter',
    options: [['all', 'All statuses'], ['todo', 'To do'], ['in_progress', 'In progress'], ['done', 'Completed']],
  });
  const priorityFilter = addSelectField(toolbar, {
    labelText: 'Priority', name: 'priorityFilter', value: filters.priority, focusKey: 'priority-filter',
    options: [['all', 'All priorities'], ['low', 'Low priority'], ['medium', 'Medium priority'], ['high', 'High priority']],
  });
  const sortFilter = addSelectField(toolbar, {
    labelText: 'Sort', name: 'sort', value: filters.sort, focusKey: 'sort-filter',
    options: [['created_desc', 'Newest first'], ['created_asc', 'Oldest first'], ['due_asc', 'Due date']],
  });
  statusFilter.addEventListener('change', () => onFiltersChange({ ...filters, status: statusFilter.value }));
  priorityFilter.addEventListener('change', () => onFiltersChange({ ...filters, priority: priorityFilter.value }));
  sortFilter.addEventListener('change', () => onFiltersChange({ ...filters, sort: sortFilter.value }));
  taskSection.append(toolbar);

  const list = element('div', 'task-list');
  list.setAttribute('aria-live', 'polite');
  if (loading) {
    list.append(element('div', 'list-state', 'Loading your tasks…'));
  } else if (error) {
    const state = element('div', 'list-state list-state-error');
    state.append(element('p', '', error), makeButton('Try again', 'button button-secondary', onRetry, pending));
    list.append(state);
  } else {
    const visibleTasks = sortTasks(tasks.filter((task) => taskMatchesFilters(task, filters)), filters.sort);
    if (!visibleTasks.length) {
      const noTasksAtAll = tasks.length === 0;
      const state = element('div', 'list-state');
      state.append(
        element('h3', '', noTasksAtAll ? 'No tasks yet' : 'No matching tasks'),
        element('p', '', noTasksAtAll
          ? 'Add your first task above. It will be saved to your FlowDesk account.'
          : 'Try changing the search or filters to find a task.')
      );
      if (!noTasksAtAll) state.append(makeButton('Clear filters', 'button button-secondary', onClearFilters));
      list.append(state);
    } else {
      for (const task of visibleTasks) {
        list.append(renderTaskCard(task, { pending, onEdit, onToggleComplete, onDelete }));
      }
    }
  }
  taskSection.append(list);
  page.append(taskSection, element('footer', 'workspace-footer', 'FlowDesk · Team Productivity Dashboard'));
  content.append(topbar, page);
  shell.append(sidebar, content);
  return shell;
}
