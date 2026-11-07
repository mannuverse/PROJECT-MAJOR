function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, action, disabled = false) {
  const node = el('button', className, label);
  node.type = 'button'; node.disabled = disabled;
  node.addEventListener('click', action);
  return node;
}

function labeledInput(labelText, name, type, value = '', options = {}) {
  const label = el('label', 'form-field work-field');
  label.append(el('span', 'field-label', labelText));
  const input = document.createElement(options.options ? 'select' : 'input');
  input.name = name;
  if (input instanceof HTMLInputElement) input.type = type;
  if (options.multiple) { input.multiple = true; input.size = 3; }
  if (options.required) input.required = true;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.focusKey) input.dataset.focusKey = options.focusKey;
  if (options.options) {
    for (const [key, text] of options.options) {
      const option = el('option', '', text); option.value = key;
      if (options.selectedValues?.includes(key)) option.selected = true;
      input.append(option);
    }
    if (!options.multiple) input.value = value || '';
  } else if (!options.multiple) input.value = value || '';
  label.append(input); return label;
}

const statusNames = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };
const priorityNames = { low: 'Low', medium: 'Medium', high: 'High' };
function localDate(date = new Date()) { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
function dateLabel(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value + 'T12:00:00')) : 'No deadline'; }
function personName(userId, members) { return members.find((person) => person.user_id === userId)?.full_name || 'Unassigned'; }

function filteredTasks(tasks, filters, userId, view) {
  const query = (filters.search || '').trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    if (view === 'my-work' && task.assignee_id !== userId && task.user_id !== userId) return false;
    if (filters.project_id && task.project_id !== filters.project_id) return false;
    if (filters.assignee_id && task.assignee_id !== filters.assignee_id) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.from && (!task.due_date || task.due_date < filters.from)) return false;
    if (filters.to && (!task.due_date || task.due_date > filters.to)) return false;
    return !query || (task.title + ' ' + task.description + ' ' + (task.category || '')).toLocaleLowerCase().includes(query);
  }).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}

function taskCard(task, props) {
  const card = el('article', 'work-task-card' + (task.status === 'done' ? ' work-task-done' : ''));
  const title = button(task.title, 'work-task-title', () => props.onOpenTask(task));
  const meta = el('div', 'work-task-meta');
  meta.append(el('span', `task-status status-${task.status}`, statusNames[task.status] || task.status));
  meta.append(el('span', `priority-chip priority-${task.priority}`, `${priorityNames[task.priority] || task.priority} priority`));
  if (task.due_date) meta.append(el('span', task.status !== 'done' && task.due_date < localDate() ? 'task-due task-overdue' : 'task-due', dateLabel(task.due_date)));
  if (task.effort_hours) meta.append(el('span', 'task-category', `${task.effort_hours}h`));
  const details = el('div', 'work-task-subline');
  details.append(el('span', '', props.projectById[task.project_id]?.name || 'Personal task'));
  details.append(el('span', '', personName(task.assignee_id, props.members)));
  card.append(title);
  if (task.description) card.append(el('p', 'work-task-description', task.description));
  card.append(meta, details);
  const actions = el('details', 'work-task-actions');
  const optionsToggle = el('summary', 'work-task-actions-toggle');
  optionsToggle.setAttribute('aria-label', 'Task options');
  optionsToggle.title = 'Task options';
  optionsToggle.append(el('span', 'sr-only', 'Task options'), el('span', 'task-options-dots', '⋯'));
  actions.append(optionsToggle);
  const actionMenu = el('div', 'work-task-action-menu');
  actionMenu.append(button('Edit task', 'button button-secondary button-small', () => props.onEditTask(task), props.pending));
  actionMenu.append(button('Details', 'button button-secondary button-small', () => props.onOpenTask(task), props.pending));
  actionMenu.append(button(task.status === 'done' ? 'Reopen' : 'Complete', 'button button-secondary button-small', () => props.onToggleComplete(task), props.pending));
  actionMenu.append(button('Delete', 'button button-danger button-small', () => props.onDelete(task), props.pending));
  actions.append(actionMenu);
  card.append(actions); return card;
}

function taskEditor(props) {
  const panel = el('section', 'surface task-editor advanced-editor');
  const heading = el('div', 'section-heading');
  heading.append(el('div', '', ''));
  const copy = heading.firstChild; copy.append(el('p', 'section-kicker', props.editingTask ? 'UPDATE TASK' : 'PLAN A NEXT STEP'), el('h2', 'section-title', props.editingTask ? 'Edit task' : 'New task'));
  panel.append(heading);
  const form = document.createElement('form'); form.className = 'work-form-grid';
  form.addEventListener('submit', (event) => { event.preventDefault(); void props.onSaveTask(new FormData(form)); });
  form.append(labeledInput('Title', 'title', 'text', props.formValues.title ?? props.editingTask?.title, { required: true, maxLength: 180, placeholder: 'What needs to get done?', focusKey: 'task-title' }));
  const projectField = labeledInput('Project', 'project_id', 'text', props.formValues.project_id ?? props.editingTask?.project_id, { options: [['', 'Personal task'], ...props.projects.map((project) => [project.id, project.name])] });
  const assigneeField = labeledInput('Assignee', 'assignee_id', 'text', props.formValues.assignee_id ?? props.editingTask?.assignee_id, { options: [['', 'Unassigned'], ...props.members.map((member) => [member.user_id, member.full_name || member.email])] });
  const assigneeHint = el('span', 'field-hint', 'Choose a project first to assign a teammate.');
  assigneeField.append(assigneeHint);
  const parentField = labeledInput('Parent task', 'parent_task_id', 'text', props.formValues.parent_task_id ?? props.editingTask?.parent_task_id, { options: [['', 'No parent'], ...props.tasks.filter((task) => task.id !== props.editingTask?.id && task.project_id === (props.formValues.project_id ?? props.editingTask?.project_id ?? null)).map((task) => [task.id, task.title])] });
  projectField.querySelector('select').addEventListener('change', (event) => {
    const projectId = event.currentTarget.value;
    const assignee = assigneeField.querySelector('select'); const parent = parentField.querySelector('select');
    const oldAssignee = assignee.value; const oldParent = parent.value;
    const availableMembers = props.membersByProject[projectId] || [];
    assignee.replaceChildren(el('option', '', 'Unassigned'));
    assignee.firstChild.value = '';
    for (const member of availableMembers) { const option = el('option', '', member.full_name || member.email); option.value = member.user_id; assignee.append(option); }
    if (availableMembers.some((member) => member.user_id === oldAssignee)) assignee.value = oldAssignee;
    assignee.disabled = !projectId || availableMembers.length === 0;
    assigneeHint.textContent = !projectId
      ? 'Choose a project first to assign a teammate.'
      : availableMembers.length
        ? 'Select a member of this project.'
        : 'No project members yet. Add a teammate from Projects.';
    const availableParents = props.tasks.filter((task) => task.id !== props.editingTask?.id && task.project_id === (projectId || null));
    parent.replaceChildren(el('option', '', 'No parent')); parent.firstChild.value = '';
    for (const task of availableParents) { const option = el('option', '', task.title); option.value = task.id; parent.append(option); }
    if (availableParents.some((task) => task.id === oldParent)) parent.value = oldParent;
  });
  projectField.querySelector('select').dispatchEvent(new Event('change'));
  form.append(projectField, assigneeField);
  form.append(labeledInput('Category', 'category', 'text', props.formValues.category ?? props.editingTask?.category, { maxLength: 80, placeholder: 'Optional label' }));
  form.append(labeledInput('Status', 'status', 'text', props.formValues.status ?? props.editingTask?.status ?? 'todo', { options: Object.entries(statusNames) }));
  form.append(labeledInput('Priority', 'priority', 'text', props.formValues.priority ?? props.editingTask?.priority ?? 'medium', { options: Object.entries(priorityNames) }));
  form.append(labeledInput('Deadline', 'due_date', 'date', props.formValues.due_date ?? props.editingTask?.due_date));
  form.append(labeledInput('Effort (hours)', 'effort_hours', 'number', props.formValues.effort_hours ?? props.editingTask?.effort_hours ?? 1));
  form.append(parentField);
  const activeDependencies = props.editingTask?.id === props.selectedTask?.id ? props.discussion.dependencies.map((item) => item.depends_on_task_id) : [];
  form.append(labeledInput('Depends on', 'dependencies', 'text', '', { multiple: true, selectedValues: activeDependencies, options: props.tasks.filter((task) => task.id !== props.editingTask?.id).map((task) => [task.id, task.title]) }));
  const description = labeledInput('Description', 'description', 'text', props.formValues.description ?? props.editingTask?.description ?? '', { placeholder: 'Add useful context.', maxLength: 2000 });
  const descriptionArea = document.createElement('textarea'); descriptionArea.name = 'description'; descriptionArea.rows = 3; descriptionArea.maxLength = 2000; descriptionArea.value = props.formValues.description ?? props.editingTask?.description ?? ''; descriptionArea.placeholder = 'Add useful context.'; description.replaceChildren(el('span', 'field-label', 'Description'), descriptionArea); form.append(description);
  const blocked = document.createElement('textarea'); blocked.name = 'blocked_reason'; blocked.rows = 2; blocked.maxLength = 500; blocked.value = props.formValues.blocked_reason ?? props.editingTask?.blocked_reason ?? ''; blocked.placeholder = 'Why is this blocked?';
  const blockedLabel = el('label', 'form-field work-field'); blockedLabel.append(el('span', 'field-label', 'Blocker details'), blocked, el('span', 'field-hint', 'Set Status to “Blocked” above, then explain what is stopping the task here.')); form.append(blockedLabel);
  const actions = el('div', 'task-form-actions work-form-actions');
  const save = el('button', 'button button-primary', props.pending ? 'Saving…' : (props.editingTask ? 'Save changes' : 'Create task')); save.type = 'submit'; save.disabled = props.pending; actions.append(save);
  actions.append(button('Cancel', 'button button-secondary', props.onCancelEdit, props.pending));
  form.append(actions); panel.append(form); return panel;
}

function filtersToolbar(props) {
  const toolbar = el('section', 'work-filters surface');
  const fields = [
    ['Search tasks', 'search', 'search', props.filters.search, { placeholder: 'Title, description…' }],
    ['Project', 'project_id', 'select', props.filters.project_id, { options: [['', 'All projects'], ...props.projects.map((p) => [p.id, p.name])] }],
    ['Person', 'assignee_id', 'select', props.filters.assignee_id, { options: [['', 'All people'], ...props.members.map((m) => [m.user_id, m.full_name || m.email])] }],
    ['Status', 'status', 'select', props.filters.status, { options: [['', 'All statuses'], ...Object.entries(statusNames)] }],
    ['Priority', 'priority', 'select', props.filters.priority, { options: [['', 'All priorities'], ...Object.entries(priorityNames)] }],
    ['From', 'from', 'date', props.filters.from, {}], ['To', 'to', 'date', props.filters.to, {}],
  ];
  for (const [label, name, type, value, options] of fields) {
    const field = labeledInput(label, name, type === 'select' ? 'text' : type, value, options);
    const control = field.querySelector('input,select');
    control.dataset.focusKey = `filter-${name}`;
    control.addEventListener(type === 'search' ? 'input' : 'change', () => props.onFiltersChange({ ...props.filters, [name]: control.value }));
    toolbar.append(field);
  }
  toolbar.append(button('Save view', 'button button-secondary button-small', props.onSaveView));
  return toolbar;
}

function taskList(items, props) {
  const list = el('div', 'work-task-list');
  if (!items.length) list.append(el('p', 'list-state', 'No tasks match these filters.'));
  else for (const task of items) list.append(taskCard(task, props));
  return list;
}

function boardView(items, props) {
  const board = el('div', 'kanban-board');
  for (const [status, title] of Object.entries(statusNames)) {
    const lane = el('section', 'kanban-lane');
    const laneHeader = el('header', 'kanban-lane-header'); laneHeader.append(el('h2', '', title), el('span', 'lane-count', String(items.filter((t) => t.status === status).length)));
    const cards = el('div', 'kanban-lane-cards');
    const laneTasks = items.filter((task) => task.status === status);
    if (!laneTasks.length) cards.append(el('p', 'kanban-empty', 'No tasks here yet'));
    else for (const task of laneTasks) cards.append(taskCard(task, props));
    lane.append(laneHeader, cards); board.append(lane);
  }
  return board;
}

function calendarView(items, props) {
  const monthDate = new Date(props.calendarMonth + '-01T12:00:00');
  const year = monthDate.getFullYear(); const month = monthDate.getMonth();
  const header = el('div', 'calendar-header');
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(monthDate);
  header.append(button('‹', 'button button-secondary button-small', () => props.onMonthChange(new Date(year, month - 1, 1))), el('h2', '', label), button('›', 'button button-secondary button-small', () => props.onMonthChange(new Date(year, month + 1, 1))));
  const grid = el('div', 'calendar-grid');
  for (const weekday of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) grid.append(el('div', 'calendar-weekday', weekday));
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  for (let blank = 0; blank < firstDay; blank++) { const cell = el('div', 'calendar-cell calendar-cell-empty'); cell.setAttribute('aria-hidden', 'true'); grid.append(cell); }
  for (let day = 1; day <= days; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = el('div', 'calendar-cell' + (date === localDate() ? ' calendar-today' : ''));
    const dayNumber = el('span', 'calendar-day-number', String(day));
    if (date === localDate()) dayNumber.setAttribute('aria-label', `Today, ${day}`);
    cell.append(dayNumber);
    const dayTasks = items.filter((item) => item.due_date === date);
    for (const task of dayTasks.slice(0, 3)) cell.append(button(task.title, `calendar-task calendar-task-${task.status}`, () => props.onOpenTask(task)));
    const more = dayTasks.length - 3;
    if (more > 0) cell.append(el('span', 'calendar-more', `+${more} more`));
    grid.append(cell);
  }
  const totalCells = firstDay + days;
  const trailing = (7 - totalCells % 7) % 7;
  for (let blank = 0; blank < trailing; blank++) { const cell = el('div', 'calendar-cell calendar-cell-empty'); cell.setAttribute('aria-hidden', 'true'); grid.append(cell); }
  const wrap = el('section', 'surface calendar-wrap'); wrap.append(header, grid); return wrap;
}

function projectPanel(props) {
  const section = el('section', 'projects-layout');
  const create = el('form', 'surface project-create-form');
  create.append(el('p', 'section-kicker', 'PROJECTS'), el('h2', 'section-title', 'Create a project'));
  const name = labeledInput('Project name', 'name', 'text', '', { required: true, maxLength: 100, placeholder: 'e.g. Website redesign' });
  const description = labeledInput('Description', 'description', 'text', '', { maxLength: 1000, placeholder: 'What is this project for?' });
  create.append(name, description);
  const submit = el('button', 'button button-primary', props.pending ? 'Saving…' : 'Create project'); submit.type = 'submit'; submit.disabled = props.pending; create.append(submit);
  create.addEventListener('submit', (event) => { event.preventDefault(); void props.onCreateProject(new FormData(create)); });
  section.append(create);
  const list = el('div', 'project-list');
  if (!props.projects.length) list.append(el('section', 'surface list-state', 'Create a project to invite teammates and assign work.'));
  for (const project of props.projects) {
    const members = props.membersByProject[project.id] || [];
    const card = el('article', 'surface project-card');
    const heading = el('div', 'project-card-heading');
    const swatch = el('span', 'project-swatch'); swatch.style.backgroundColor = project.color;
    heading.append(swatch, el('div', '', ''));
    heading.lastChild.append(el('h2', 'section-title', project.name), el('p', 'project-description', project.description || 'No description yet.'));
    card.append(heading);
    const summary = el('div', 'project-summary');
    const tasks = props.tasks.filter((task) => task.project_id === project.id);
    const done = tasks.filter((task) => task.status === 'done').length;
    summary.append(el('span', '', `${tasks.length} tasks`), el('span', '', `${done} complete`), el('span', '', `${members.length} people`)); card.append(summary);
    if (props.profile.id === project.owner_id) {
      const form = el('form', 'project-member-form');
      const email = labeledInput('Add a teammate by account email', 'email', 'email', '', { required: true, placeholder: 'teammate@example.com' });
      const add = el('button', 'button button-secondary button-small', 'Add member'); add.type = 'submit'; form.append(email, add);
      form.addEventListener('submit', (event) => { event.preventDefault(); void props.onAddMember(project.id, new FormData(form).get('email')); });
      card.append(form);
    }
    const roster = el('div', 'member-roster');
    for (const member of members) {
      const row = el('div', 'member-row');
      row.append(el('span', '', `${member.full_name || member.email}${member.member_role === 'owner' ? ' · owner' : ''}`));
      const capacity = document.createElement('input'); capacity.type = 'number'; capacity.min = '0'; capacity.max = '168'; capacity.step = '0.5'; capacity.value = String(member.capacity_hours); capacity.setAttribute('aria-label', `${member.full_name || member.email} weekly capacity in hours`);
      capacity.disabled = member.user_id !== props.profile.id && project.owner_id !== props.profile.id;
      capacity.addEventListener('change', () => void props.onCapacityChange(project.id, member.user_id, Number(capacity.value)));
      row.append(capacity, el('span', '', 'h/week')); roster.append(row);
    }
    card.append(roster); list.append(card);
  }
  section.append(list);
  const workload = el('section', 'surface workload-panel'); workload.append(el('p', 'section-kicker', 'CAPACITY'), el('h2', 'section-title', 'Assigned effort vs. availability'));
  const activeProject = props.projects.find((project) => project.id === props.filters.project_id) || props.projects[0];
  if (props.projects.length) {
    const picker = labeledInput('Project', 'capacity_project', 'text', activeProject?.id || '', { options: props.projects.map((project) => [project.id, project.name]) });
    picker.querySelector('select').addEventListener('change', (event) => props.onFiltersChange({ ...props.filters, project_id: event.currentTarget.value }));
    workload.append(picker);
  }
  const people = activeProject ? (props.membersByProject[activeProject.id] || []) : [];
  if (!people.length) workload.append(el('p', 'dashboard-empty-note', 'Create a project and add team members to track workload.'));
  for (const person of people) {
    const assigned = props.tasks.filter((task) => task.project_id === activeProject.id && task.assignee_id === person.user_id && task.status !== 'done').reduce((sum, task) => sum + Number(task.effort_hours || 0), 0);
    const available = Number(person.capacity_hours || 0); const percent = available ? Math.min(100, Math.round(assigned / available * 100)) : 0;
    const row = el('div', 'workload-row');
    const top = el('div', 'workload-copy'); top.append(el('strong', '', person.full_name || person.email), el('span', '', `${assigned}h / ${available}h weekly`));
    const bar = el('div', 'workload-track'); const value = el('span', 'workload-value'); value.style.width = `${percent}%`; bar.append(value);
    row.append(top, bar); workload.append(row);
  }
  section.append(workload); return section;
}

function detailPanel(props, task) {
  if (!task) return null;
  const panel = el('section', 'surface task-detail-panel');
  const heading = el('div', 'task-detail-heading'); heading.append(el('div', '', ''));
  heading.firstChild.append(el('p', 'section-kicker', 'TASK DETAILS'), el('h2', 'section-title', task.title));
  heading.append(button('Edit', 'button button-secondary button-small', () => props.onEditTask(task)), button('Close', 'button button-secondary button-small', props.onCloseTask)); panel.append(heading);
  panel.append(el('p', 'task-description', task.description || 'No description.'), el('p', 'task-detail-summary', `${statusNames[task.status]} · ${priorityNames[task.priority]} priority · ${dateLabel(task.due_date)}`));
  if (task.status === 'blocked' && task.blocked_reason) panel.append(el('p', 'feedback feedback-error', `Blocked: ${task.blocked_reason}`));
  const subtasks = props.tasks.filter((item) => item.parent_task_id === task.id);
  if (subtasks.length) { panel.append(el('h3', '', 'Subtasks')); for (const subtask of subtasks) panel.append(button(`${statusNames[subtask.status]} · ${subtask.title}`, 'text-button subtask-link', () => props.onOpenTask(subtask))); }
  const dependencyForm = el('form', 'dependency-form');
  dependencyForm.append(el('h3', '', 'Dependencies'));
  const selected = new Set(props.discussion.dependencies.map((dependency) => dependency.depends_on_task_id));
  const select = document.createElement('select'); select.multiple = true; select.size = Math.min(5, Math.max(2, props.tasks.length)); select.setAttribute('aria-label', 'Tasks that must be completed first');
  for (const other of props.tasks.filter((item) => item.id !== task.id)) { const option = el('option', '', other.title); option.value = other.id; option.selected = selected.has(other.id); select.append(option); }
  dependencyForm.append(select); const saveDeps = el('button', 'button button-secondary button-small', 'Save dependencies'); saveDeps.type = 'submit'; dependencyForm.append(saveDeps);
  dependencyForm.addEventListener('submit', (event) => { event.preventDefault(); void props.onSaveDependencies(task.id, [...select.selectedOptions].map((option) => option.value)); });
  panel.append(dependencyForm);
  const discussion = el('div', 'discussion-grid');
  const comments = el('section', 'discussion-column'); comments.append(el('h3', '', 'Comments'));
  for (const comment of props.discussion.comments) {
    const person = props.profileById[comment.author_id]; const item = el('article', 'comment-item');
    item.append(el('strong', '', person?.full_name || 'Teammate'), el('time', '', dateLabel(comment.created_at.slice(0, 10))), el('p', '', comment.body)); comments.append(item);
  }
  const commentForm = el('form', 'comment-form'); const body = document.createElement('textarea'); body.name = 'body'; body.rows = 3; body.required = true; body.maxLength = 4000; body.placeholder = 'Write an update. Type @name to mention a teammate.';
  const send = el('button', 'button button-primary button-small', 'Post comment'); send.type = 'submit'; commentForm.append(body, send);
  commentForm.addEventListener('submit', (event) => { event.preventDefault(); const text = body.value; const mentions = props.members.filter((member) => text.toLocaleLowerCase().includes(`@${(member.full_name || '').toLocaleLowerCase()}`)).map((member) => member.user_id); void props.onAddComment(task.id, text, mentions); });
  comments.append(commentForm); discussion.append(comments);
  const history = el('section', 'discussion-column'); history.append(el('h3', '', 'Activity'));
  for (const item of props.discussion.activity) {
    const person = props.profileById[item.actor_id]; const label = { created: 'created this task', updated: 'updated task details', assigned: 'changed the assignee', status_changed: `changed status to ${statusNames[item.details?.to] || 'updated'}`, commented: 'added a comment' }[item.event_type] || item.event_type;
    history.append(el('p', 'activity-item', `${person?.full_name || 'A teammate'} ${label} · ${new Date(item.created_at).toLocaleString()}`));
  }
  discussion.append(history); panel.append(discussion); return panel;
}

function reportsPanel(props, items) {
  const panel = el('div', 'reports-grid');
  const statusCounts = Object.entries(statusNames).map(([key, label]) => [key, label, items.filter((task) => task.status === key).length]);
  const priorities = Object.entries(priorityNames).map(([key, label]) => [key, label, items.filter((task) => task.priority === key && task.status !== 'done').length]);
  const chart = (title, rows, category) => {
    const block = el('section', 'surface report-chart'); block.append(el('p', 'section-kicker', 'REPORT'), el('h2', 'section-title', title));
    const max = Math.max(1, ...rows.map((row) => row[2]));
    for (const [key, label, count] of rows) {
      const line = button('', 'report-bar-row', () => props.onChartFilter(category, key));
      const copy = el('span', '', label); const track = el('span', 'report-bar-track'); const fill = el('span', 'report-bar-value'); fill.style.width = `${Math.max(count ? 8 : 0, count / max * 100)}%`; track.append(fill); line.append(copy, track, el('strong', '', String(count))); block.append(line);
    }
    return block;
  };
  panel.append(chart('Tasks by status', statusCounts, 'status'), chart('Open tasks by priority', priorities, 'priority'));
  const views = el('section', 'surface saved-views-panel'); views.append(el('p', 'section-kicker', 'YOUR DASHBOARD'), el('h2', 'section-title', 'Saved views'));
  views.append(button('Export visible tasks as CSV', 'button button-secondary button-small', props.onExport));
  const saveForm = el('form', 'saved-view-form'); const name = document.createElement('input'); name.name = 'name'; name.required = true; name.maxLength = 60; name.placeholder = 'Name this filter view';
  const save = el('button', 'button button-primary button-small', 'Save current filters'); save.type = 'submit'; saveForm.append(name, save);
  saveForm.addEventListener('submit', (event) => { event.preventDefault(); void props.onSaveView(name.value); }); views.append(saveForm);
  for (const view of props.savedViews) {
    const row = el('div', 'saved-view-row'); row.append(button(view.name, 'text-button', () => props.onApplyView(view)), button('Delete', 'button button-danger button-small', () => props.onDeleteView(view.id))); views.append(row);
  }
  panel.append(views); return panel;
}

export function renderWorkspacePage(props) {
  const shell = el('div', 'workspace-shell'); const sidebar = el('aside', 'workspace-sidebar');
  const brand = el('div', 'workspace-brand'); brand.append(el('span', 'brand-mark', 'F'), el('span', '', 'FlowDesk')); sidebar.append(brand);
  const menu = el('details', 'workspace-menu'); menu.open = true;
  const menuToggle = el('summary', 'workspace-menu-toggle'); menuToggle.append(el('span', '', 'Workspace'), el('span', 'workspace-menu-chevron')); menu.append(menuToggle);
  const nav = el('nav', 'workspace-nav');
  const routes = [['overview', 'Overview'], ['tasks', 'Tasks'], ['board', 'Kanban'], ['calendar', 'Calendar'], ['my-work', 'My Work'], ['projects', 'Projects'], ['reports', 'Reports']];
  for (const [route, label] of routes) {
    const item = button(label, 'workspace-nav-item' + (props.view === route ? ' workspace-nav-active' : ''), () => props.onNavigate(route));
    if (props.view === route) item.setAttribute('aria-current', 'page'); nav.append(item);
  }
  if (props.profile.role === 'admin') nav.append(button('Admin', 'workspace-nav-item', () => props.onNavigate('admin')));
  const unread = props.notifications.filter((notification) => !notification.read_at).length;
  nav.append(button(`Notifications${unread ? ` · ${unread}` : ''}`, 'workspace-nav-item', () => props.onToggleNotifications()));
  menu.append(nav);
  sidebar.append(menu, el('p', 'sidebar-note', 'Projects, tasks, and team focus in one place.'));
  const content = el('div', 'workspace-content'); const topbar = el('header', 'workspace-topbar');
  topbar.append(el('span', 'topbar-context', 'Team workspace'));
  const account = el('div', 'topbar-account'); const accountCopy = el('div', 'account-copy');
  accountCopy.append(el('span', 'account-name', props.profile.full_name || props.email), el('span', 'account-email', props.email), el('span', 'account-role', `${props.profile.role} account`));
  account.append(accountCopy, button('Sign out', 'button button-secondary button-small', props.onSignOut, props.pending)); topbar.append(account);
  const page = el('main', 'workspace-feature-page');
  const names = { tasks: ['YOUR WORK', 'All tasks'], board: ['TEAM FLOW', 'Kanban board'], calendar: ['PLAN AHEAD', 'Calendar'], 'my-work': ['PERSONAL FOCUS', 'My Work'], projects: ['TEAM SPACE', 'Projects & workload'], reports: ['INSIGHTS', 'Reports'] };
  const [kicker, title] = names[props.view] || names.tasks;
  const heading = el('div', 'page-heading'); const intro = el('div', 'page-heading-copy'); intro.append(el('p', 'eyebrow', `FLOWDESK · ${kicker}`), el('h1', 'page-title', title), el('p', 'page-description', 'Plan together, keep ownership clear, and see what is moving.'));
  heading.append(intro);
  if (props.view === 'tasks') heading.append(button('＋ New task', 'button button-primary', props.onNewTask, props.pending));
  page.append(heading);
  if (props.feedback) { const notice = el('p', `feedback ${props.feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}`, props.feedback.message); notice.setAttribute('role', props.feedback.type === 'error' ? 'alert' : 'status'); page.append(notice); }
  if (props.activityNotice) page.append(el('p', 'activity-notice', props.activityNotice));
  if (props.workspaceError) { const error = el('p', 'feedback feedback-error', `Team features need the Stage 7 Supabase migration. ${props.workspaceError}`); error.setAttribute('role', 'alert'); page.append(error); }
  if (props.notificationsOpen) {
    const notices = el('section', 'surface notifications-panel'); notices.append(el('h2', 'section-title', 'Notifications'));
    if (!props.notifications.length) notices.append(el('p', 'dashboard-empty-note', 'You are all caught up.'));
    for (const notification of props.notifications) {
      const row = el('article', 'notification-row' + (notification.read_at ? '' : ' notification-unread'));
      row.append(el('p', '', notification.message), el('time', '', new Date(notification.created_at).toLocaleString()));
      if (!notification.read_at) row.append(button('Mark read', 'text-button', () => props.onMarkRead(notification.id)));
      if (notification.task_id) row.append(button('Open task', 'button button-secondary button-small', () => props.onOpenTask(props.tasks.find((task) => task.id === notification.task_id))));
      notices.append(row);
    }
    page.append(notices);
  }
  if (props.view === 'tasks' && props.showEditor) page.append(taskEditor(props));
  if (props.view === 'projects') page.append(projectPanel(props));
  else if (props.view === 'reports') page.append(reportsPanel(props, props.visibleTasks));
  else {
    page.append(filtersToolbar(props));
    if (props.loading) page.append(el('p', 'list-state', 'Loading your tasks…'));
    else if (props.error) {
      const error = el('section', 'surface list-state list-state-error');
      error.append(el('p', '', props.error), button('Try again', 'button button-secondary', props.onRetry)); page.append(error);
    } else if (props.view === 'board') page.append(boardView(props.visibleTasks, props));
    else if (props.view === 'calendar') page.append(calendarView(props.visibleTasks, props));
    else page.append(taskList(props.visibleTasks, props));
    if (props.selectedTask) page.append(detailPanel(props, props.selectedTask));
  }
  page.append(el('footer', 'workspace-footer', 'FlowDesk · Team Productivity Dashboard'));
  content.append(topbar, page); shell.append(sidebar, content); return shell;
}

