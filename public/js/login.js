(function () {
  const $ = (s) => document.querySelector(s);
  const HOME = '/';

  const signIn = { form: $('#login-form'), user: $('#username'), pass: $('#password'), btn: $('#login-btn'), error: $('#login-error') };
  const change = { form: $('#change-form'), cur: $('#current-password'), next: $('#new-password'), again: $('#confirm-password'), btn: $('#change-btn'), error: $('#change-error') };
  const steps = { signIn: $('#step-signin'), change: $('#step-change') };

  // ---------- helpers ----------
  function showError(box, message, tone = 'red') {
    box.className = `gf-note gf-note-${tone}`;
    box.querySelector('span').textContent = message;
    box.classList.remove('gf-hidden');
  }
  const hideError = (box) => box.classList.add('gf-hidden');

  function setLoading(btn, loading, label) {
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="gf-spinner" aria-hidden="true"></span><span>Please wait</span>' : `<span>${label}</span>`;
  }

  function goHome() { location.replace(HOME); }

  // ---------- already signed in? ----------
  if (Session.active) {
    Api.get('/auth/me', { handle401: false }).then(goHome).catch((err) => {
      // no connection is not a reason to sign the person out: they can keep working offline
      if (err && err.code === 'NETWORK') goHome(); else Session.clear();
    });
  } else {
    Session.clear();
  }

  // ---------- show / hide password ----------
  document.querySelectorAll('[data-toggle-password]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = document.getElementById(toggle.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      toggle.querySelector('i').className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  });

  // ---------- sign in ----------
  signIn.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(signIn.error);

    const username = signIn.user.value.trim();
    const password = signIn.pass.value;
    if (!username || !password) {
      showError(signIn.error, 'Enter your username and password.');
      (username ? signIn.pass : signIn.user).focus();
      return;
    }

    setLoading(signIn.btn, true);
    try {
      const data = await Api.post('/auth/login', { username, password }, { auth: false });
      Session.save(data);
      if (data.user && data.user.must_change_password) {
        steps.signIn.classList.add('gf-hidden');
        steps.change.classList.remove('gf-hidden');
        change.cur.value = password; // they just typed it; saves retyping
        change.next.focus();
      } else {
        goHome();
        return;
      }
    } catch (err) {
      const locked = err.status === 423;
      showError(signIn.error, err.message, locked ? 'amber' : 'red');
      if (err.status === 401) { signIn.pass.value = ''; signIn.pass.focus(); }
    }
    setLoading(signIn.btn, false, 'Sign in');
  });

  // ---------- forced password change ----------
  change.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(change.error);

    if (!change.cur.value || !change.next.value) return showError(change.error, 'Fill in all three fields.');
    if (change.next.value !== change.again.value) return showError(change.error, 'The new passwords do not match.');
    if (change.next.value === change.cur.value) return showError(change.error, 'The new password must be different from the current one.');

    setLoading(change.btn, true);
    try {
      const data = await Api.post('/auth/change-password',
        { current_password: change.cur.value, new_password: change.next.value }, { handle401: false });
      Session.save(data); // fresh token: old sessions were ended by the server
      goHome();
      return;
    } catch (err) {
      showError(change.error, err.message);
    }
    setLoading(change.btn, false, 'Save password and continue');
  });
})();