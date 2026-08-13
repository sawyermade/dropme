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
