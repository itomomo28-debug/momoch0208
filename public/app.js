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
let files = [];

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
background.addEventListener('input', () => { preview.style.background = background.value; });

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
