import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(root, 'uploads');
const rendersDir = path.join(root, 'renders');
await Promise.all([mkdir(uploadsDir, { recursive: true }), mkdir(rendersDir, { recursive: true })]);

const upload = multer({
  dest: uploadsDir,
  limits: { files: 12, fileSize: 150 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    callback(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'));
  }
});

const app = express();
app.use(express.static(path.join(root, 'public')));
app.use('/renders', express.static(rendersDir, { fallthrough: false }));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-3000))));
  });
}

function hexColor(value) {
  return /^[0-9a-f]{6}$/i.test(value) ? value : '101014';
}

app.post('/api/render', upload.array('media', 12), async (req, res) => {
  const files = req.files ?? [];
  if (!files.length) return res.status(400).json({ error: '写真または動画を追加してください。' });

  const job = randomUUID();
  const jobDir = path.join(uploadsDir, job);
  await mkdir(jobDir, { recursive: true });
  const duration = Math.min(10, Math.max(1, Number(req.body.duration) || 3));
  const background = hexColor(req.body.background);
  const output = path.join(rendersDir, `${job}.mp4`);
  const normalized = [];

  try {
    for (const [index, file] of files.entries()) {
      const segment = path.join(jobDir, `${index}.mp4`);
      const isImage = file.mimetype.startsWith('image/');
      const inputArgs = isImage ? ['-loop', '1', '-t', String(duration), '-i', file.path] : ['-i', file.path, '-t', String(duration)];
      await run('ffmpeg', [
        '-y', ...inputArgs,
        '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x${background},fps=30,format=yuv420p`,
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', segment
      ]);
      normalized.push(segment);
    }

    const concatFile = path.join(jobDir, 'concat.txt');
    await writeFile(concatFile, normalized.map(file => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', '-movflags', '+faststart', output]);
    res.json({ url: `/renders/${job}.mp4`, duration: duration * files.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '動画の書き出しに失敗しました。別の素材でもう一度お試しください。' });
  } finally {
    await Promise.all(files.map(file => rm(file.path, { force: true })));
    await rm(jobDir, { recursive: true, force: true });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message });
  res.status(500).json({ error: '予期しないエラーが発生しました。' });
});

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`Reel Studio: http://localhost:${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
