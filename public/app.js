const input = document.querySelector('#files');
const dropzone = document.querySelector('#dropzone');
const list = document.querySelector('#mediaList');
const preview = document.querySelector('#preview');
const renderButton = document.querySelector('#render');
const duration = document.querySelector('#duration');
const durationValue = document.querySelector('#durationValue');
const background = document.querySelector('#background');
const status = document.querySelector('#status');
const template = document.querySelector('#mediaTemplate');
const clientTabs = document.querySelector('#clientTabs');
const activeClientName = document.querySelector('#activeClientName');
const clientDialog = document.querySelector('#clientDialog');
const clientFields = document.querySelector('#clientFields');
let files = [];
let clients = JSON.parse(localStorage.getItem('reel-studio-clients') || 'null') || [
  { id: crypto.randomUUID(), name: 'クライアント 1', background: '#101014' },
  { id: crypto.randomUUID(), name: 'クライアント 2', background: '#101014' },
  { id: crypto.randomUUID(), name: 'クライアント 3', background: '#101014' },
  { id: crypto.randomUUID(), name: 'クライアント 4', background: '#101014' }
];
const presetClients = [
  { preset: 'shibukawa', name: '渋川市 PR提案', background: '#1f3a2e' }
];
presetClients.forEach(preset => {
  if (!clients.some(client => client.preset === preset.preset)) clients.push({ id: crypto.randomUUID(), ...preset });
});
let activeClient = localStorage.getItem('reel-studio-active-client') || clients[0].id;

function saveClients() { localStorage.setItem('reel-studio-clients', JSON.stringify(clients)); }
function selectClient(id) {
  const client = clients.find(item => item.id === id) || clients[0];
  activeClient = client.id;
  localStorage.setItem('reel-studio-active-client', activeClient);
  activeClientName.textContent = client.name;
  background.value = client.background;
  preview.style.background = client.background;
  files = [];
  status.textContent = '';
  refresh();
  renderClients();
}
function renderClients() {
  clientTabs.replaceChildren();
  clients.forEach((client, index) => {
    const button = document.createElement('button');
    button.textContent = client.name || `案件 ${index + 1}`;
    button.classList.toggle('active', client.id === activeClient);
    button.onclick = () => selectClient(client.id);
    clientTabs.append(button);
  });
}
function openClientManager() {
  clientFields.replaceChildren();
  clients.forEach((client, index) => {
    const label = document.createElement('label');
    label.textContent = `案件 ${index + 1}`;
    const field = document.createElement('input');
    field.value = client.name;
    field.maxLength = 40;
    field.dataset.clientId = client.id;
    label.append(field);
    clientFields.append(label);
  });
  clientDialog.showModal();
}

function formatSize(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function refresh() {
  list.replaceChildren();
  files.forEach((file, index) => {
    const item = template.content.cloneNode(true);
    const thumb = item.querySelector('.thumb');
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video'); video.src = url; video.muted = true; thumb.append(video);
    } else thumb.style.backgroundImage = `url(${url})`;
    item.querySelector('strong').textContent = file.name;
    item.querySelector('.meta span').textContent = `${file.type.startsWith('video/') ? '動画' : '写真'} · ${formatSize(file.size)}`;
    item.querySelector('button').onclick = () => { files.splice(index, 1); refresh(); };
    list.append(item);
  });
  renderButton.disabled = !files.length;
  preview.replaceChildren();
  if (files[0]) {
    const element = document.createElement(files[0].type.startsWith('video/') ? 'video' : 'img');
    element.src = URL.createObjectURL(files[0]);
    if (element.tagName === 'VIDEO') { element.controls = true; element.muted = true; }
    preview.append(element);
  } else preview.innerHTML = '<div class="empty"><b>9:16</b><span>プレビュー</span></div>';
}

function addFiles(selected) {
  files = [...files, ...selected].filter(file => file.type.startsWith('image/') || file.type.startsWith('video/')).slice(0, 12);
  refresh();
}
input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
for (const name of ['dragenter','dragover']) dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('dragging'); });
for (const name of ['dragleave','drop']) dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
duration.addEventListener('input', () => { durationValue.textContent = `${duration.value}秒`; });
background.addEventListener('input', () => {
  preview.style.background = background.value;
  const client = clients.find(item => item.id === activeClient);
  if (client) { client.background = background.value; saveClients(); }
});
document.querySelector('#manageClients').addEventListener('click', openClientManager);
document.querySelector('#clientForm').addEventListener('submit', event => {
  event.preventDefault();
  clientFields.querySelectorAll('input').forEach(field => {
    const client = clients.find(item => item.id === field.dataset.clientId);
    if (client) client.name = field.value.trim() || client.name;
  });
  saveClients();
  clientDialog.close();
  selectClient(activeClient);
});

renderButton.addEventListener('click', async () => {
  renderButton.disabled = true; status.textContent = '高画質リールを書き出しています…';
  const data = new FormData(); files.forEach(file => data.append('media', file));
  data.append('duration', duration.value); data.append('background', background.value.slice(1));
  try {
    const response = await fetch('/api/render', { method:'POST', body:data });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    status.innerHTML = `完成しました（${result.duration}秒） · <a href="${result.url}" download="instagram-reel.mp4">MP4をダウンロード</a>`;
  } catch (error) { status.textContent = error.message || '書き出しに失敗しました。'; }
  finally { renderButton.disabled = !files.length; }
});

saveClients();
selectClient(activeClient);
