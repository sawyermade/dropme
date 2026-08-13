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
  xhr.open('POST', '/api/upload');

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
    } else if (xhr.status === 401) {
      window.location.href = '/login';
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
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});
