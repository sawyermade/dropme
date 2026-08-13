const usersEl = document.getElementById('users');
const emptyMsg = document.getElementById('empty-msg');
const logoutBtn = document.getElementById('logout-btn');

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

async function load() {
  const res = await fetch(`${window.BASE_PATH}/api/admin/files`);
  if (res.status === 401 || res.status === 403) {
    window.location.href = `${window.BASE_PATH}/login`;
    return;
  }

  const { users } = await res.json();
  usersEl.innerHTML = '';

  const usersWithFiles = users.filter((u) => u.files.length > 0);
  emptyMsg.hidden = usersWithFiles.length > 0;

  usersWithFiles.forEach(({ username, files }) => {
    const section = document.createElement('section');
    section.className = 'admin-user';

    const heading = document.createElement('h2');
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

      li.appendChild(nameSpan);
      li.appendChild(link);
      list.appendChild(li);
    });

    section.appendChild(list);
    usersEl.appendChild(section);
  });
}

logoutBtn.addEventListener('click', async () => {
  await fetch(`${window.BASE_PATH}/api/logout`, { method: 'POST' });
  window.location.href = `${window.BASE_PATH}/login`;
});

load();
