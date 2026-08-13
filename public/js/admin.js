// Client-side logic for the admin page (views/admin.html): the same
// drag/drop/paste/browse upload box as the regular user page (uploads land
// in the admin's own folder), a read-only listing of every user's uploaded
// files with share/delete controls, and full user management (add, change
// password, delete).
//
// window.BASE_PATH is injected server-side (see renderPage in server.js) so
// every fetch/link/redirect here still resolves correctly if the app is
// hosted under a path prefix instead of a domain root.

const uploadsEl = document.getElementById('uploads-by-user');
const uploadsSummary = document.getElementById('uploads-summary');
const emptyMsg = document.getElementById('empty-msg');
const logoutBtn = document.getElementById('logout-btn');
const userListEl = document.getElementById('user-list');
const userListSummary = document.getElementById('user-list-summary');
const addUserForm = document.getElementById('add-user-form');
const addUserError = document.getElementById('add-user-error');

// Files the admin has picked but not yet uploaded (cleared once the upload succeeds).
let selectedFiles = [];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileListEl = document.getElementById('file-list');
const uploadBtn = document.getElementById('upload-btn');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const statusMsg = document.getElementById('status-msg');

// --- Share modal --------------------------------------------------------
// One modal, reused for whichever file's Share button was last clicked.
// Unlike the user page, the admin can share ANY user's file, so the modal
// needs to remember which user the current file belongs to as well.

const shareModal = document.getElementById('share-modal');
const shareModalTitle = document.getElementById('share-modal-title');
const shareModalClose = document.getElementById('share-modal-close');
const shareToggle = document.getElementById('share-toggle');
const shareUrlRow = document.getElementById('share-url-row');
const shareUrlInput = document.getElementById('share-url-input');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareCopiedMsg = document.getElementById('share-copied-msg');

// { username, filename } for the file the currently-open modal is for (null when closed).
let shareContext = null;

function buildShareUrl(token) {
  return `${window.location.origin}${window.BASE_PATH}/s/${token}`;
}

function shareApiUrl(username, filename) {
  return `${window.BASE_PATH}/api/admin/share/${encodeURIComponent(username)}/${encodeURIComponent(filename)}`;
}

// Opens the modal for `username`'s `filename` and loads its current share
// status from the server, since it may already be shared from a previous visit.
function openShareModal(username, filename) {
  shareContext = { username, filename };
  shareModalTitle.textContent = `Share "${filename}"`;
  shareUrlRow.hidden = true;
  shareCopiedMsg.hidden = true;
  shareToggle.checked = false;
  shareToggle.disabled = true; // re-enabled once we know the real state, below
  shareModal.hidden = false;

  fetch(shareApiUrl(username, filename)).then(async (res) => {
    if (await handleAuthFailure(res)) return;
    const data = await res.json();
    shareToggle.disabled = false;
    shareToggle.checked = !!data.token;
    if (data.token) {
      shareUrlInput.value = buildShareUrl(data.token);
      shareUrlRow.hidden = false;
    }
  });
}

function closeShareModal() {
  shareModal.hidden = true;
  shareContext = null;
}

shareModalClose.addEventListener('click', closeShareModal);

// Clicking the dimmed backdrop (not the modal card itself) also closes it.
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) closeShareModal();
});

// Flipping the toggle creates or revokes the share via the API, then shows/hides the URL.
shareToggle.addEventListener('change', async () => {
  if (!shareContext) return;
  shareToggle.disabled = true;
  const url = shareApiUrl(shareContext.username, shareContext.filename);

  if (shareToggle.checked) {
    const res = await fetch(url, { method: 'POST' });
    if (await handleAuthFailure(res)) return;
    const { token } = await res.json();
    shareUrlInput.value = buildShareUrl(token);
    shareUrlRow.hidden = false;
  } else {
    await fetch(url, { method: 'DELETE' });
    shareUrlRow.hidden = true;
    shareUrlInput.value = '';
    shareCopiedMsg.hidden = true;
  }

  shareToggle.disabled = false;
});

shareCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
  } catch {
    // Clipboard API can fail (permissions, focus state) — fall back to a manual-copy selection.
    shareUrlInput.select();
    document.execCommand('copy');
  }

  shareCopiedMsg.hidden = false;
  setTimeout(() => {
    shareCopiedMsg.hidden = true;
  }, 1500);
});

// --- Small shared helpers ---------------------------------------------------

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

// Every admin API route 401s if the session expired and 403s if it's not an
// admin session (e.g. an admin got demoted in another tab) — either way,
// bounce to the login page. Returns true if it redirected, so callers can
// `if (await handleAuthFailure(res)) return;` and stop processing.
async function handleAuthFailure(res) {
  if (res.status === 401 || res.status === 403) {
    window.location.href = `${window.BASE_PATH}/login`;
    return true;
  }
  return false;
}

// --- Picking files to upload (identical flow to the user page) ------------

// Adds newly picked files to the pending list, skipping ones already queued
// (same name/size/last-modified — good enough to dedupe drag-drop + browse).
function addFiles(fileList) {
  for (const file of fileList) {
    const alreadyAdded = selectedFiles.some(
      (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );
    if (!alreadyAdded) selectedFiles.push(file);
  }
  renderSelectedFiles();
}

function removeSelectedFile(index) {
  selectedFiles.splice(index, 1);
  renderSelectedFiles();
}

// Renders the "about to upload" list and enables/disables the Upload button.
function renderSelectedFiles() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${file.name} (${formatSize(file.size)})`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeSelectedFile(index));

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    fileListEl.appendChild(li);
  });

  uploadBtn.disabled = selectedFiles.length === 0;
}

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);

['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);

dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});

browseBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = ''; // so picking the same file again still fires 'change'
});

// Anywhere-on-the-page paste, so the admin can Ctrl+V a copied file straight in.
document.addEventListener('paste', (e) => {
  const files = e.clipboardData?.files;
  if (files?.length) addFiles(files);
});

// Uploads go through the same /api/upload route the regular user page uses,
// so files the admin drops here land in their own uploads/<admin>/ folder
// and then show up below in the Uploads listing like anyone else's.
uploadBtn.addEventListener('click', () => {
  if (!selectedFiles.length) return;

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('files', file, file.name));

  // XMLHttpRequest (not fetch) so we can show real upload progress.
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${window.BASE_PATH}/api/upload`);

  uploadBtn.disabled = true;
  statusMsg.textContent = '';
  progressWrap.hidden = false;
  progressBar.style.width = '0%';

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      progressBar.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    }
  });

  xhr.addEventListener('load', () => {
    progressWrap.hidden = true;

    if (xhr.status >= 200 && xhr.status < 300) {
      statusMsg.textContent = `Uploaded ${selectedFiles.length} file(s) successfully.`;
      selectedFiles = [];
      renderSelectedFiles();
      loadUploads(); // refresh the Uploads listing so the new file(s) appear immediately
    } else if (xhr.status === 401) {
      window.location.href = `${window.BASE_PATH}/login`;
    } else {
      statusMsg.textContent = 'Upload failed.';
      uploadBtn.disabled = false;
    }
  });

  xhr.addEventListener('error', () => {
    progressWrap.hidden = true;
    statusMsg.textContent = 'Upload failed.';
    uploadBtn.disabled = false;
  });

  xhr.send(formData);
});

// --- Uploads listing (every user's files) ----------------------------------

// Recomputes the "Uploads (N)" count from what's actually still in the DOM,
// so it stays correct after files are deleted without needing a full reload.
function updateUploadsSummary() {
  const fileCount = uploadsEl.querySelectorAll('.file-list li').length;
  uploadsSummary.textContent = `Uploads (${fileCount})`;
}

// Fetches and renders every user's uploaded files, grouped into a collapsed
// <details> per user (also collapsed by default) with Download/Share/Delete
// controls on each file. Called on load and again after any upload/delete.
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

    const details = document.createElement('details');
    details.className = 'admin-user-details';

    const summary = document.createElement('summary');
    summary.textContent = `${username} (${files.length})`;
    details.appendChild(summary);

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

      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'share-btn';
      shareBtn.textContent = 'Share';
      shareBtn.addEventListener('click', () => openShareModal(username, file.name));

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
          // Remove it from the page immediately rather than reloading the whole list.
          li.remove();
          if (list.children.length === 0) {
            // That was this user's last file — collapse their whole section away.
            section.remove();
            emptyMsg.hidden = uploadsEl.children.length > 0;
          } else {
            summary.textContent = `${username} (${list.children.length})`;
          }
          updateUploadsSummary();
        } else {
          const json = await res.json().catch(() => ({}));
          alert(json.error || 'Failed to delete file.');
        }
      });

      const actions = document.createElement('div');
      actions.className = 'file-actions';
      actions.appendChild(link);
      actions.appendChild(shareBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(nameSpan);
      li.appendChild(actions);
      list.appendChild(li);
    });

    details.appendChild(list);
    section.appendChild(details);
    uploadsEl.appendChild(section);
  });

  updateUploadsSummary();
}

// --- User management (add / change password / delete) ---------------------

// Fetches and renders every account into the collapsed Users list, each row
// with an inline "set password" form and a Delete button. Called on load and
// again after adding, editing, or deleting a user.
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
        // Simplest to just refetch — the server also rejects deleting yourself,
        // so we don't need to special-case that here.
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
