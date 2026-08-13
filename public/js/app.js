// Client-side logic for the regular user's drop page (views/app.html):
// picking files to upload (drag/drop, paste, or browse), uploading them with
// a progress bar, listing the user's own previously-uploaded files, and the
// share/delete controls on each of those files.
//
// window.BASE_PATH is injected server-side (see renderPage in server.js) so
// every fetch/link/redirect here still resolves correctly if the app is
// hosted under a path prefix instead of a domain root.

// Files the user has picked but not yet uploaded (cleared once the upload succeeds).
let selectedFiles = [];

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const fileListEl = document.getElementById('file-list');
const uploadBtn = document.getElementById('upload-btn');
const logoutBtn = document.getElementById('logout-btn');
const progressWrap = document.getElementById('progress-wrap');
const progressBar = document.getElementById('progress-bar');
const statusMsg = document.getElementById('status-msg');
const myFileListEl = document.getElementById('my-file-list');
const myFilesEmpty = document.getElementById('my-files-empty');

// --- Share modal --------------------------------------------------------
// One modal, reused for whichever file's Share button was last clicked.

const shareModal = document.getElementById('share-modal');
const shareModalTitle = document.getElementById('share-modal-title');
const shareModalClose = document.getElementById('share-modal-close');
const shareToggle = document.getElementById('share-toggle');
const shareUrlRow = document.getElementById('share-url-row');
const shareUrlInput = document.getElementById('share-url-input');
const shareCopyBtn = document.getElementById('share-copy-btn');
const shareCopiedMsg = document.getElementById('share-copied-msg');

// Which file the currently-open share modal is for (null when it's closed).
let shareFilename = null;

function buildShareUrl(token) {
  return `${window.location.origin}${window.BASE_PATH}/s/${token}`;
}

// Opens the modal for `filename` and loads its current share status from the
// server, since a file may already be shared from a previous visit.
function openShareModal(filename) {
  shareFilename = filename;
  shareModalTitle.textContent = `Share "${filename}"`;
  shareUrlRow.hidden = true;
  shareCopiedMsg.hidden = true;
  shareToggle.checked = false;
  shareToggle.disabled = true; // re-enabled once we know the real state, below
  shareModal.hidden = false;

  fetch(`${window.BASE_PATH}/api/share/${encodeURIComponent(filename)}`)
    .then((res) => {
      if (res.status === 401) {
        window.location.href = `${window.BASE_PATH}/login`;
        return null;
      }
      return res.json();
    })
    .then((data) => {
      if (!data) return;
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
  shareFilename = null;
}

shareModalClose.addEventListener('click', closeShareModal);

// Clicking the dimmed backdrop (not the modal card itself) also closes it.
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) closeShareModal();
});

// Flipping the toggle creates or revokes the share via the API, then shows/hides the URL.
shareToggle.addEventListener('change', async () => {
  if (!shareFilename) return;
  shareToggle.disabled = true;
  const url = `${window.BASE_PATH}/api/share/${encodeURIComponent(shareFilename)}`;

  if (shareToggle.checked) {
    const res = await fetch(url, { method: 'POST' });
    if (res.status === 401) {
      window.location.href = `${window.BASE_PATH}/login`;
      return;
    }
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

// --- Picking files to upload ---------------------------------------------

// Adds newly picked files to the pending list, skipping ones already queued
// (same name/size/last-modified — good enough to dedupe drag-drop + browse).
function addFiles(fileList) {
  for (const file of fileList) {
    const alreadyAdded = selectedFiles.some(
      (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified
    );
    if (!alreadyAdded) selectedFiles.push(file);
  }
  renderList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderList();
}

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

// Renders the "about to upload" list and enables/disables the Upload button.
function renderList() {
  fileListEl.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${file.name} (${formatSize(file.size)})`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeFile(index));

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    fileListEl.appendChild(li);
  });

  uploadBtn.disabled = selectedFiles.length === 0;
}

function formatDate(ms) {
  return new Date(ms).toLocaleString();
}

// --- "Your files" list (already-uploaded files) ---------------------------

// Fetches and renders the user's own uploaded files, each with Download,
// Share, and Delete controls. Called on page load and again after any
// upload/delete so the list stays in sync without a full page refresh.
async function loadMyFiles() {
  const res = await fetch(`${window.BASE_PATH}/api/files`);
  if (res.status === 401) {
    window.location.href = `${window.BASE_PATH}/login`;
    return;
  }

  const { files } = await res.json();
  myFileListEl.innerHTML = '';
  myFilesEmpty.hidden = files.length > 0;

  files.forEach((file) => {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${file.name} (${formatSize(file.size)}, ${formatDate(file.mtime)})`;

    const link = document.createElement('a');
    link.className = 'download-link';
    link.href = `${window.BASE_PATH}/api/download/${encodeURIComponent(file.name)}`;
    link.textContent = 'Download';

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'share-btn';
    shareBtn.textContent = 'Share';
    shareBtn.addEventListener('click', () => openShareModal(file.name));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-file-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return;

      const res = await fetch(`${window.BASE_PATH}/api/files/${encodeURIComponent(file.name)}`, {
        method: 'DELETE',
      });

      if (res.status === 401) {
        window.location.href = `${window.BASE_PATH}/login`;
        return;
      }

      if (res.ok) {
        // Remove it from the page immediately rather than reloading the whole list.
        li.remove();
        myFilesEmpty.hidden = myFileListEl.children.length > 0;
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
    myFileListEl.appendChild(li);
  });
}

// --- Drag & drop / paste / browse -----------------------------------------

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

// Anywhere-on-the-page paste, so users can Ctrl+V a copied file straight in.
document.addEventListener('paste', (e) => {
  const files = e.clipboardData?.files;
  if (files?.length) addFiles(files);
});

// --- Upload ----------------------------------------------------------------

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
      renderList();
      loadMyFiles(); // refresh "Your files" so the new upload(s) appear immediately
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

logoutBtn.addEventListener('click', async () => {
  await fetch(`${window.BASE_PATH}/api/logout`, { method: 'POST' });
  window.location.href = `${window.BASE_PATH}/login`;
});

loadMyFiles();
