const modeDetails = {
  signIn: {
    eyebrow: 'FLOWDESK · WELCOME BACK',
    title: 'Sign in to your workspace.',
    description: 'Use your account email and password to continue.',
    submitLabel: 'Sign in',
  },
  signUp: {
    eyebrow: 'FLOWDESK · GET STARTED',
    title: 'Create your account.',
    description: 'Every new account starts with the standard user role.',
    submitLabel: 'Create account',
  },
  resetRequest: {
    eyebrow: 'FLOWDESK · ACCOUNT HELP',
    title: 'Reset your password.',
    description: 'We’ll send a password reset link if the account exists.',
    submitLabel: 'Send reset link',
  },
  updatePassword: {
    eyebrow: 'FLOWDESK · SECURE ACCOUNT',
    title: 'Choose a new password.',
    description: 'Enter and confirm your new password to finish the reset.',
    submitLabel: 'Update password',
  },
};

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addField(form, { id, name, labelText, type, autocomplete, required, minLength, maxLength }) {
  const field = element('div', 'form-field');
  const label = element('label', '', labelText);
  label.htmlFor = id;

  const input = document.createElement('input');
  input.id = id;
  input.name = name;
  input.type = type;
  input.autocomplete = autocomplete;
  input.required = required;
  if (minLength) input.minLength = minLength;
  if (maxLength) input.maxLength = maxLength;
  field.append(label, input);
  form.append(field);
  return input;
}

function addModeButton(container, label, mode, onModeChange, pending) {
  const button = element('button', 'text-button', label);
  button.type = 'button';
  button.disabled = pending;
  button.addEventListener('click', () => onModeChange(mode));
  container.append(button);
}

export function renderAuthPage({ mode, feedback, pending, onModeChange, onSubmit }) {
  const details = modeDetails[mode] || modeDetails.signIn;
  const panel = element('main', 'welcome-panel auth-card');
  panel.setAttribute('aria-labelledby', 'auth-title');
  panel.append(
    element('p', 'eyebrow', details.eyebrow),
    element('h1', 'auth-title', details.title),
    element('p', 'auth-description', details.description)
  );
  panel.querySelector('h1').id = 'auth-title';

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit(mode, new FormData(form));
  });

  if (mode === 'signUp') {
    addField(form, {
      id: 'full-name', name: 'fullName', labelText: 'Full name', type: 'text',
      autocomplete: 'name', required: true, maxLength: 120,
    });
  }

  if (mode !== 'updatePassword') {
    addField(form, {
      id: 'email', name: 'email', labelText: 'Email address', type: 'email',
      autocomplete: 'email', required: true, maxLength: 254,
    });
  }

  if (mode === 'signIn' || mode === 'signUp' || mode === 'updatePassword') {
    const password = addField(form, {
      id: 'password', name: 'password', labelText: mode === 'signIn' ? 'Password' : 'New password',
      type: 'password', autocomplete: mode === 'signIn' ? 'current-password' : 'new-password',
      required: true, minLength: mode === 'signIn' ? undefined : 8, maxLength: 128,
    });

    if (mode === 'updatePassword') {
      const confirmation = addField(form, {
        id: 'confirm-password', name: 'confirmPassword', labelText: 'Confirm new password',
        type: 'password', autocomplete: 'new-password', required: true, minLength: 8, maxLength: 128,
      });
      const validateMatch = () => {
        confirmation.setCustomValidity(
          confirmation.value && confirmation.value !== password.value ? 'Passwords do not match.' : ''
        );
      };
      password.addEventListener('input', validateMatch);
      confirmation.addEventListener('input', validateMatch);
    }
  }

  if (feedback) {
    const notice = element(
      'p',
      `feedback ${feedback.type === 'error' ? 'feedback-error' : 'feedback-success'}`,
      feedback.message
    );
    notice.setAttribute('role', feedback.type === 'error' ? 'alert' : 'status');
    panel.append(notice);
  }

  const submit = element('button', 'button button-primary', pending ? 'Please wait…' : details.submitLabel);
  submit.type = 'submit';
  submit.disabled = pending;
  form.append(submit);
  panel.append(form);

  const navigation = element('div', 'auth-navigation');
  if (mode === 'signIn') {
    addModeButton(navigation, 'Create an account', 'signUp', onModeChange, pending);
    addModeButton(navigation, 'Forgot password?', 'resetRequest', onModeChange, pending);
  } else if (mode === 'signUp' || mode === 'resetRequest') {
    addModeButton(navigation, 'Back to sign in', 'signIn', onModeChange, pending);
    if (mode === 'resetRequest') {
      addModeButton(navigation, 'Create an account', 'signUp', onModeChange, pending);
    }
  }
  if (navigation.childElementCount) panel.append(navigation);

  panel.append(element('footer', 'auth-footer', 'FlowDesk · Team Productivity Dashboard'));
  return panel;
}
