function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderSignedInPage({ profile, email, feedback, pending, onSignOut }) {
  const panel = element('main', 'welcome-panel auth-card account-card');
  panel.setAttribute('aria-labelledby', 'account-title');
  panel.append(
    element('p', 'eyebrow', 'FLOWDESK · ACCOUNT'),
    element('h1', 'auth-title', `Welcome, ${profile.full_name || email}.`),
    element('p', 'auth-description', 'You are signed in. Task management will be added in a later stage.')
  );
  panel.querySelector('h1').id = 'account-title';

  const details = element('dl', 'account-details');
  details.append(
    element('dt', '', 'Email'), element('dd', '', email),
    element('dt', '', 'Role'), element('dd', '', profile.role)
  );
  panel.append(details);

  if (feedback) {
    const notice = element(
      'p',
      `feedback ${feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}`,
      feedback.message
    );
    notice.setAttribute('role', feedback.type === 'error' ? 'alert' : 'status');
    panel.append(notice);
  }

  const signOutButton = element('button', 'button button-secondary', pending ? 'Please wait…' : 'Sign out');
  signOutButton.type = 'button';
  signOutButton.disabled = pending;
  signOutButton.addEventListener('click', () => void onSignOut());
  panel.append(signOutButton, element('footer', 'auth-footer', 'FlowDesk · Team Productivity Dashboard'));
  return panel;
}
