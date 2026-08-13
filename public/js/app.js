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
    actions.appendChild(deleteBtn);

    li.appendChild(nameSpan);
    li.appendChild(actions);
    myFileListEl.appendChild(li);
  });
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
  fileInput.value = '';
});

document.addEventListener('paste', (e) => {
  const files = e.clipboardData?.files;
  if (files?.length) addFiles(files);
});

uploadBtn.addEventListener('click', () => {
  if (!selectedFiles.length) return;

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('files', file, file.name));

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
      loadMyFiles();
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
