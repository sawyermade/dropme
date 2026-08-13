// Client-side logic for the login page (views/login.html). Submits
// credentials to /api/login and either redirects to / (which then sends
// regular users to the drop page and admins to /admin) or shows the error.
//
// window.BASE_PATH is injected server-side (see renderPage in server.js) so
// this still resolves correctly if the app is hosted under a path prefix.

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const data = new FormData(form);
  const res = await fetch(`${window.BASE_PATH}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: data.get('username'),
      password: data.get('password'),
    }),
  });

  if (res.ok) {
    window.location.href = `${window.BASE_PATH}/`;
    return;
  }

  const json = await res.json().catch(() => ({}));
  errorEl.textContent = json.error || 'Login failed';
  errorEl.hidden = false;
});
