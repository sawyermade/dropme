const uploadsEl = document.getElementById('uploads-by-user');
const emptyMsg = document.getElementById('empty-msg');
const logoutBtn = document.getElementById('logout-btn');
const userListEl = document.getElementById('user-list');
const userListSummary = document.getElementById('user-list-summary');
const addUserForm = document.getElementById('add-user-form');
const addUserError = document.getElementById('add-user-error');

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(ms) {
  return new Date(ms).toLocaleString();
}

async function handleAuthFailure(res) {
  if (res.status === 401 || res.status === 403) {
    window.location.href = `${window.BASE_PATH}/login`;
    return true;
  }
  return false;
}

async function loadUploads() {
  const res = await fetch(`${window.BASE_PATH}/api/admin/files`);
  if (await handleAuthFailure(res)) return;

  const { users } = await res.json();
  uploadsEl.innerHTML = '';

  const usersWithFiles = users.filter((u) => u.files.length > 0);
  emptyMsg.hidden = usersWithFiles.length > 0;

  usersWithFiles.forEach(({ username, files }) => {
    const section = document.createElement('section');
    section.className = 'admin-user';

    const heading = document.createElement('h3');
    heading.textContent = username;
    section.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'file-list';

    files.forEach((file) => {
      const li = document.createElement('li');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${file.name} (${formatSize(file.size)}, ${formatDate(file.mtime)})`;

      const link = document.createElement('a');
      link.className = 'download-link';
      link.href = `${window.BASE_PATH}/api/admin/download/${encodeURIComponent(username)}/${encodeURIComponent(file.name)}`;
      link.textContent = 'Download';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-file-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete "${file.name}" (uploaded by ${username})? This cannot be undone.`)) return;

        const res = await fetch(
          `${window.BASE_PATH}/api/admin/files/${encodeURIComponent(username)}/${encodeURIComponent(file.name)}`,
          { method: 'DELETE' }
        );

        if (await handleAuthFailure(res)) return;

        if (res.ok) {
          li.remove();
          if (list.children.length === 0) {
            section.remove();
            emptyMsg.hidden = uploadsEl.children.length > 0;
          }
        } else {
          const json = await res.json().catch(() => ({}));
          alert(json.error || 'Failed to delete file.');
        }
      });

      const actions = document.createElement('div');
      actions.className = 'file-actions';
      actions.appendChild(link);
      actions.appendChild(deleteBtn);

      li.appendChild(nameSpan);
      li.appendChild(actions);
      list.appendChild(li);
    });

    section.appendChild(list);
    uploadsEl.appendChild(section);
  });
}

async function loadUsers() {
  const res = await fetch(`${window.BASE_PATH}/api/admin/users`);
  if (await handleAuthFailure(res)) return;

  const { users } = await res.json();
  userListEl.innerHTML = '';
  userListSummary.textContent = `Users (${users.length})`;

  users.forEach(({ username, isAdmin }) => {
    const li = document.createElement('li');
    li.className = 'user-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = isAdmin ? `${username} (admin)` : username;

    const passwordForm = document.createElement('form');
    passwordForm.className = 'password-form';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'New password';
    passwordInput.required = true;

    const setBtn = document.createElement('button');
    setBtn.type = 'submit';
    setBtn.textContent = 'Set password';

    const rowMsg = document.createElement('span');
    rowMsg.className = 'user-row-msg';

    passwordForm.appendChild(passwordInput);
    passwordForm.appendChild(setBtn);

    passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      rowMsg.textContent = '';
      rowMsg.classList.remove('error');

      const res = await fetch(
        `${window.BASE_PATH}/api/admin/users/${encodeURIComponent(username)}/password`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: passwordInput.value }),
        }
      );

      if (await handleAuthFailure(res)) return;

      if (res.ok) {
        passwordInput.value = '';
        rowMsg.textContent = 'Password updated.';
      } else {
        const json = await res.json().catch(() => ({}));
        rowMsg.textContent = json.error || 'Failed to update password.';
        rowMsg.classList.add('error');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-user-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete user "${username}"? Their uploaded files will NOT be deleted.`)) return;

      const res = await fetch(`${window.BASE_PATH}/api/admin/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
      });

      if (await handleAuthFailure(res)) return;

      if (res.ok) {
        loadUsers();
      } else {
        const json = await res.json().catch(() => ({}));
        alert(json.error || 'Failed to delete user.');
      }
    });

    li.appendChild(nameSpan);
    li.appendChild(passwordForm);
    li.appendChild(rowMsg);
    li.appendChild(deleteBtn);
    userListEl.appendChild(li);
  });
}

addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addUserError.hidden = true;

  const data = new FormData(addUserForm);
  const res = await fetch(`${window.BASE_PATH}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: data.get('username'),
      password: data.get('password'),
      isAdmin: data.get('isAdmin') === 'on',
    }),
  });

  if (await handleAuthFailure(res)) return;

  if (res.ok) {
    addUserForm.reset();
    loadUsers();
    return;
  }

  const json = await res.json().catch(() => ({}));
  addUserError.textContent = json.error || 'Failed to add user.';
  addUserError.hidden = false;
});

logoutBtn.addEventListener('click', async () => {
  await fetch(`${window.BASE_PATH}/api/logout`, { method: 'POST' });
  window.location.href = `${window.BASE_PATH}/login`;
});

loadUploads();
loadUsers();
