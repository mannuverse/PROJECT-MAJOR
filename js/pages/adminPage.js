const ADMIN_PAGE_SIZE = 20;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, handler, disabled = false) {
  const control = element('button', className, label);
  control.type = 'button';
  control.disabled = disabled;
  control.addEventListener('click', handler);
  return control;
}

function selectField(label, options, selected, focusKey, onChange) {
  const field = element('label', 'admin-filter-field');
  field.append(element('span', 'field-label', label));
  const select = document.createElement('select');
  select.setAttribute('aria-label', label);
  select.value = selected;
  if (focusKey) select.dataset.focusKey = focusKey;
  for (const [value, text] of options) {
    const option = element('option', '', text);
    option.value = value;
    select.append(option);
  }
  select.value = selected;
  select.addEventListener('change', () => onChange(select.value));
  field.append(select);
  return field;
}

function inputField(label, type, value, focusKey, onInput) {
  const field = element('label', 'admin-filter-field');
  field.append(element('span', 'field-label', label));
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  input.setAttribute('aria-label', label);
  if (focusKey) input.dataset.focusKey = focusKey;
  input.addEventListener(type === 'search' ? 'input' : 'change', () => onInput(input.value));
  field.append(input);
  return field;
}

function localDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function localDatePart(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function localDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sessionStatus(session) {
  if (session.logout_at) return 'Closed';
  const lastSeen = new Date(session.last_seen_at).getTime();
  const now = Date.now();
  if (lastSeen <= now + 2 * 60 * 1000 && now - lastSeen <= ACTIVE_WINDOW_MS) return 'Active';
  return 'Stale';
}

function estimatedDuration(session) {
  const start = new Date(session.login_at).getTime();
  const end = session.logout_at
    ? new Date(session.logout_at).getTime()
    : sessionStatus(session) === 'Active'
      ? Date.now()
      : new Date(session.last_seen_at).getTime();
  const elapsedMs = Math.max(0, end - start);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  if (totalMinutes === 0 && elapsedMs >= 1000) return '<1m';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? hours + 'h ' + minutes + 'm' : minutes + 'm';
}

function metric(label, value, description, color) {
  const card = element('article', 'metric-card metric-' + color);
  card.append(element('span', 'metric-label', label), element('strong', 'metric-value', String(value)));
  card.append(element('span', 'metric-detail', description));
  return card;
}

function renderProfilesTable(profiles) {
  const wrapper = element('div', 'admin-table-wrap');
  const table = document.createElement('table');
  table.className = 'admin-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['Name', 'Email', 'Role', 'Account created']) {
    headerRow.append(element('th', '', label));
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const profile of profiles) {
    const row = document.createElement('tr');
    const roleCell = document.createElement('td');
    roleCell.append(elementRole(profile.role));
    row.append(
      element('td', 'admin-person-name', profile.full_name || 'Name not provided'),
      element('td', 'admin-email', profile.email || 'Email not available'),
      roleCell,
      element('td', '', localDate(profile.created_at))
    );
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function elementRole(role) {
  const pill = element('span', 'role-pill role-' + role, role);
  return pill;
}

function renderSessionsTable(sessions) {
  const wrapper = element('div', 'admin-table-wrap');
  const table = document.createElement('table');
  table.className = 'admin-table session-table';
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const label of ['User', 'Status', 'Login', 'Logout', 'Last seen', 'Est. duration']) {
    headerRow.append(element('th', '', label));
  }
  head.append(headerRow);
  const body = document.createElement('tbody');
  for (const session of sessions) {
    const profile = session.profile;
    const name = profile?.full_name || 'Unknown user';
    const email = profile?.email || session.user_id;
    const status = sessionStatus(session);
    const statusPill = element('span', 'session-state session-' + status.toLowerCase(), status);
    const statusCell = document.createElement('td');
    statusCell.append(statusPill);
    const row = document.createElement('tr');
    row.append(
      element('td', 'admin-session-user', name + ' · ' + email),
      statusCell,
      element('td', '', localDateTime(session.login_at)),
      element('td', '', session.logout_at ? localDateTime(session.logout_at) : '—'),
      element('td', '', localDateTime(session.last_seen_at)),
      element('td', '', estimatedDuration(session))
    );
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function renderPager(page, totalPages, onPageChange) {
  const pager = element('div', 'admin-pager');
  pager.append(
    element('span', 'pager-copy', 'Page ' + page + ' of ' + totalPages),
    button('Previous', 'button button-secondary button-small', () => onPageChange(page - 1), page <= 1),
    button('Next', 'button button-secondary button-small', () => onPageChange(page + 1), page >= totalPages)
  );
  return pager;
}

export function renderAdminPage({
  profile, email, data, loading, error, feedback, activityNotice, pending, tab, filters,
  onNavigate, onSignOut, onRetry, onTabChange, onFiltersChange,
}) {
  const shell = element('div', 'workspace-shell');
  const sidebar = element('aside', 'workspace-sidebar');
  const brand = element('div', 'workspace-brand');
  brand.append(element('span', 'brand-mark', 'F'), element('span', '', 'FlowDesk'));
  sidebar.append(brand);
  const nav = element('nav', 'workspace-nav');
  nav.append(element('span', 'sidebar-label', 'WORKSPACE'));
  nav.append(
    button('Overview', 'workspace-nav-item', () => onNavigate('overview'), pending),
    button('My Tasks', 'workspace-nav-item', () => onNavigate('tasks'), pending)
  );
  const adminNav = button('Admin', 'workspace-nav-item workspace-nav-active', () => onNavigate('admin'), pending);
  adminNav.setAttribute('aria-current', 'page');
  nav.append(adminNav);
  sidebar.append(nav, element('p', 'sidebar-note', 'Read-only administration and session history.'));

  const content = element('div', 'workspace-content');
  const topbar = element('header', 'workspace-topbar');
  topbar.append(element('span', 'topbar-context', 'Administrator workspace'));
  const account = element('div', 'topbar-account');
  const accountCopy = element('div', 'account-copy');
  accountCopy.append(
    element('span', 'account-name', profile.full_name || email),
    element('span', 'account-email', email),
    element('span', 'account-role', 'admin account')
  );
  account.append(
    accountCopy,
    button(pending ? 'Signing out…' : 'Sign out', 'button button-secondary button-small', () => void onSignOut(), pending)
  );
  topbar.append(account);

  const page = element('main', 'admin-page');
  const heading = element('div', 'page-heading');
  const intro = element('div', 'page-heading-copy');
  intro.append(
    element('p', 'eyebrow', 'FLOWDESK · ADMIN'),
    element('h1', 'page-title', 'Admin overview'),
    element('p', 'page-description', 'Review application profiles and best-effort session activity.')
  );
  heading.append(intro, button('Refresh data', 'button button-secondary', onRetry, pending));
  page.append(heading);

  if (activityNotice) {
    const notice = element('p', 'activity-notice', activityNotice);
    notice.setAttribute('role', 'status');
    page.append(notice);
  }
  if (feedback) {
    const notice = element('p', 'feedback ' + (feedback.type === 'error' ? 'feedback-error' : 'feedback-success'), feedback.message);
    notice.setAttribute('role', feedback.type === 'error' ? 'alert' : 'status');
    page.append(notice);
  }

  if (loading) {
    page.append(element('div', 'dashboard-load-state', 'Loading administrative data…'));
  } else if (error) {
    const errorPanel = element('section', 'surface admin-error');
    errorPanel.append(
      element('p', 'feedback feedback-error', error),
      element('p', 'admin-error-help', 'If the profile email column is missing, run supabase/stage6_admin_email.sql in the Supabase SQL Editor.'),
      button('Try again', 'button button-secondary', onRetry, pending)
    );
    page.append(errorPanel);
  } else if (data) {
    const summary = element('section', 'dashboard-metrics admin-metrics');
    summary.setAttribute('aria-label', 'Administrator summary');
    summary.append(
      metric('Profiles', data.profileCount, 'Registered application accounts', 'blue'),
      metric('Recent logins', data.recentLoginCount, 'Last 7 days', 'violet'),
      metric('Active sessions', data.activeSessionCount, 'Heartbeat within 2 minutes', 'green'),
      metric('Session records', data.sessionCount, 'Latest records listed below', 'rose')
    );
    page.append(summary);

    const tabs = element('div', 'admin-tabs');
    const profilesTab = button('People', 'admin-tab' + (tab === 'profiles' ? ' admin-tab-active' : ''), () => onTabChange('profiles'), pending);
    profilesTab.setAttribute('aria-pressed', String(tab === 'profiles'));
    const sessionsTab = button('Session activity', 'admin-tab' + (tab === 'sessions' ? ' admin-tab-active' : ''), () => onTabChange('sessions'), pending);
    sessionsTab.setAttribute('aria-pressed', String(tab === 'sessions'));
    tabs.append(profilesTab, sessionsTab);
    page.append(tabs);

    const listSection = element('section', 'surface admin-list-panel');
    if (tab === 'profiles') {
      listSection.append(
        element('p', 'section-kicker', 'ACCOUNT DIRECTORY'),
        element('h2', 'section-title', 'Profiles')
      );
      const filtersRow = element('div', 'admin-filters');
      filtersRow.append(
        inputField('Search name or email', 'search', filters.profileSearch, 'admin-profile-search', (value) => onFiltersChange({ ...filters, profileSearch: value, profilePage: 1 })),
        selectField('Role', [['all', 'All roles'], ['user', 'User'], ['admin', 'Admin']], filters.profileRole, 'admin-profile-role', (value) => onFiltersChange({ ...filters, profileRole: value, profilePage: 1 }))
      );
      listSection.append(filtersRow);

      const query = filters.profileSearch.trim().toLocaleLowerCase();
      const matched = data.profiles.filter((person) =>
        (!query || (person.full_name + ' ' + person.email).toLocaleLowerCase().includes(query))
        && (filters.profileRole === 'all' || person.role === filters.profileRole)
      );
      const pageCount = Math.max(1, Math.ceil(matched.length / ADMIN_PAGE_SIZE));
      const pageNumber = Math.min(filters.profilePage, pageCount);
      const pageRows = matched.slice((pageNumber - 1) * ADMIN_PAGE_SIZE, pageNumber * ADMIN_PAGE_SIZE);
      listSection.append(element('p', 'admin-result-note', matched.length + ' profiles in the loaded list'));
      if (data.profileRowsLimited) {
        listSection.append(element('p', 'admin-limit-note', 'Showing the 500 most recently created profiles. Search and pagination apply to this loaded set.'));
      }
      if (pageRows.length) {
        listSection.append(renderProfilesTable(pageRows), renderPager(pageNumber, pageCount, (nextPage) => onFiltersChange({ ...filters, profilePage: nextPage })));
      } else {
        listSection.append(element('p', 'admin-empty-note', 'No profiles match these filters.'));
      }
    } else {
      listSection.append(
        element('p', 'section-kicker', 'BEST-EFFORT HISTORY'),
        element('h2', 'section-title', 'Session activity')
      );
      const userOptions = [['all', 'All users'], ...data.profiles.map((person) => [
        person.id,
        (person.full_name || person.email || 'Unnamed user') + ' · ' + person.email,
      ])];
      const filtersRow = element('div', 'admin-filters session-filters');
      filtersRow.append(
        selectField('User', userOptions, filters.sessionUser, 'admin-session-user', (value) => onFiltersChange({ ...filters, sessionUser: value, sessionPage: 1 })),
        inputField('Login from', 'date', filters.sessionFrom, 'admin-session-from', (value) => onFiltersChange({ ...filters, sessionFrom: value, sessionPage: 1 })),
        inputField('Login through', 'date', filters.sessionTo, 'admin-session-to', (value) => onFiltersChange({ ...filters, sessionTo: value, sessionPage: 1 }))
      );
      listSection.append(filtersRow);

      const matched = data.sessions.filter((record) => {
        const loginDate = localDatePart(record.login_at);
        return (filters.sessionUser === 'all' || record.user_id === filters.sessionUser)
          && (!filters.sessionFrom || loginDate >= filters.sessionFrom)
          && (!filters.sessionTo || loginDate <= filters.sessionTo);
      });
      const pageCount = Math.max(1, Math.ceil(matched.length / ADMIN_PAGE_SIZE));
      const pageNumber = Math.min(filters.sessionPage, pageCount);
      const pageRows = matched.slice((pageNumber - 1) * ADMIN_PAGE_SIZE, pageNumber * ADMIN_PAGE_SIZE);
      listSection.append(element('p', 'admin-result-note', matched.length + ' sessions in the loaded list'));
      listSection.append(element('p', 'admin-limit-note', 'Active means a heartbeat was received within the last 2 minutes. Session length is an estimate; browser closure can leave a record stale.'));
      if (data.sessionRowsLimited) {
        listSection.append(element('p', 'admin-limit-note', 'Showing the 500 most recent session records. Filters and pagination apply to this loaded set.'));
      }
      if (pageRows.length) {
        listSection.append(renderSessionsTable(pageRows), renderPager(pageNumber, pageCount, (nextPage) => onFiltersChange({ ...filters, sessionPage: nextPage })));
      } else {
        listSection.append(element('p', 'admin-empty-note', 'No sessions match these filters.'));
      }
    }
    page.append(listSection);
  }

  page.append(element('footer', 'workspace-footer', 'FlowDesk · Team Productivity Dashboard'));
  content.append(topbar, page);
  shell.append(sidebar, content);
  return shell;
}
