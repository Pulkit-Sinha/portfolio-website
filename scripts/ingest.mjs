#!/usr/bin/env node
// /family gallery ingest — walks a folder on the external drive, produces web
// derivatives, uploads them to R2, and registers metadata in D1 via the admin API.
//
//   node ingest.mjs --dir "/Volumes/Elements/photos/Dad's Oppo Nov23"
//   node ingest.mjs --dir "/Volumes/Elements/photos"            # whole drive
//
// Flags: --root <path>   rel_path base (default /Volumes/Elements/photos)
//        --dry-run       list what would happen, touch nothing
//        --concurrency N photo workers (default 4)
//
// Config: scripts/.env with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//         R2_BUCKET, ADMIN_TOKEN, API_BASE (e.g. https://pulkit-sinha.com or
//         http://localhost:8788 for wrangler pages dev).
//
// Resumable by construction (schema.md §5): local manifest (path+mtime+size),
// content_hash UNIQUE in D1, and R2 HEAD-before-PUT.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, readdir, stat, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { exiftool } from 'exiftool-vendored';
import sharp from 'sharp';

const run = promisify(execFile);

/* ── Config ──────────────────────────────────────────────────────────── */

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const MANIFEST_PATH = path.join(SCRIPT_DIR, 'ingest.manifest.json');

const PHOTO_EXT = new Set(['.jpg', '.jpeg', '.heic', '.png', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.mov']);
const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '.Trashes', '.Spotlight-V100']);

const THUMB_PX = 400;
const WEB_PX = 1600;
const REGISTER_BATCH = 200;

function parseArgs() {
  const args = { root: '/Volumes/Elements/photos', concurrency: 4, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') args.dir = argv[++i];
    else if (argv[i] === '--root') args.root = argv[++i];
    else if (argv[i] === '--concurrency') args.concurrency = Number(argv[++i]) || 4;
    else if (argv[i] === '--kind') args.kind = argv[++i]; // photo | video — omit for both
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  if (!args.dir) {
    console.error('usage: node ingest.mjs --dir <folder> [--root <base>] [--dry-run]');
    process.exit(1);
  }
  return args;
}

async function loadEnv() {
  const env = {};
  try {
    const raw = await readFile(path.join(SCRIPT_DIR, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error('scripts/.env not found — see the setup checklist in docs/family-gallery/workflow.md');
    process.exit(1);
  }
  for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'ADMIN_TOKEN']) {
    if (!env[key]) {
      console.error(`scripts/.env is missing ${key}`);
      process.exit(1);
    }
  }
  env.API_BASE = env.API_BASE || 'https://pulkit-sinha.com';
  return env;
}

/* ── Manifest ────────────────────────────────────────────────────────── */

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

let manifestDirty = false;
async function saveManifest(manifest) {
  if (!manifestDirty) return;
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest));
  manifestDirty = false;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function swapExt(rel, ext) {
  return rel.replace(/\.[^./]+$/, '') + ext;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// Network blips shouldn't fail files — requeue and pause all workers with
// exponential backoff (5s → 5min, 10 tries ≈ 25min of outage tolerance).
const NET_ERR = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|fetch failed|timed? ?out|aborted/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pool(items, size, worker) {
  const queue = [...items];
  let failed = 0;
  let netPauseUntil = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        if (Date.now() < netPauseUntil) await sleep(netPauseUntil - Date.now());
        const item = queue.shift();
        if (!item) break;
        try {
          await worker(item);
        } catch (err) {
          item._netRetries = (item._netRetries || 0) + 1;
          if (NET_ERR.test(err.message) && item._netRetries <= 10) {
            const wait = Math.min(300, 5 * 2 ** (item._netRetries - 1));
            console.warn(`  ⏸ network error (${item.rel}) — pausing ${wait}s, retry ${item._netRetries}/10`);
            netPauseUntil = Math.max(netPauseUntil, Date.now() + wait * 1000);
            queue.push(item);
            continue;
          }
          failed++;
          console.error(`  ✗ ${item.rel}: ${err.message}`);
        }
      }
    })
  );
  return failed;
}

/* ── R2 ──────────────────────────────────────────────────────────────── */

function makeS3(env) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    // A dead socket must fail (and hit the pool's retry) instead of hanging
    // the whole run — observed once ~30 photos from the finish line.
    requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
  });
}

async function uploadIfMissing(s3, bucket, key, body, contentType) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return false; // already there
  } catch {}
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return true;
}

/* ── Photo pipeline ──────────────────────────────────────────────────── */

async function processPhoto(ctx, file) {
  const { s3, env, tmp } = ctx;
  const ext = path.extname(file.abs).toLowerCase();

  // HEIC/BMP → JPEG via macOS sips first (sharp prebuilds decode neither).
  let srcPath = file.abs;
  let sipsTmp = null;
  if (ext === '.heic' || ext === '.bmp') {
    sipsTmp = path.join(tmp, `${file.hash}.jpg`);
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', file.abs, '--out', sipsTmp]);
    srcPath = sipsTmp;
  }

  const src = sharp(srcPath, { failOn: 'none' });
  const thumb = await src
    .clone()
    .rotate() // bake EXIF orientation before metadata is dropped
    .resize(THUMB_PX, THUMB_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  const web = await src
    .clone()
    .rotate()
    .resize(WEB_PX, WEB_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  // orig tier: JPEG sources get a lossless GPS-only strip; everything else is
  // re-encoded at full resolution q95 (schema.md → R2 Key Conventions).
  let orig;
  if (ext === '.jpg' || ext === '.jpeg') {
    const stripTmp = path.join(tmp, `${file.hash}-orig.jpg`);
    try {
      await copyFile(file.abs, stripTmp);
      await exiftool.write(stripTmp, {}, { writeArgs: ['-gps:all=', '-overwrite_original'] });
      orig = await readFile(stripTmp);
    } catch {
      // Truncated/corrupt JPEG (e.g. missing EOI marker) — exiftool refuses a
      // lossless strip, but sharp can still salvage a q95 re-encode.
      orig = await sharp(srcPath, { failOn: 'none' }).rotate().jpeg({ quality: 95 }).toBuffer();
    }
    await rm(stripTmp, { force: true });
    await rm(`${stripTmp}_exiftool_tmp`, { force: true }); // stale tmp from an aborted strip
  } else {
    orig = await sharp(srcPath, { failOn: 'none' }).rotate().jpeg({ quality: 95 }).toBuffer();
  }
  if (sipsTmp) await rm(sipsTmp, { force: true });

  const jpgKey = swapExt(file.rel, '.jpg');
  await uploadIfMissing(s3, env.R2_BUCKET, `thumb/${jpgKey}`, thumb, 'image/jpeg');
  await uploadIfMissing(s3, env.R2_BUCKET, `web/${jpgKey}`, web, 'image/jpeg');
  await uploadIfMissing(s3, env.R2_BUCKET, `orig/${jpgKey}`, orig, 'image/jpeg');
}

/* ── Video pipeline ──────────────────────────────────────────────────── */

async function probeVideo(abs) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name:format=duration',
    '-of', 'json',
    abs,
  ]);
  const info = JSON.parse(stdout);
  const video = (info.streams || []).find((s) => s.codec_type === 'video');
  const audio = (info.streams || []).find((s) => s.codec_type === 'audio');
  return {
    vcodec: video?.codec_name,
    acodec: audio?.codec_name,
    duration: Number(info.format?.duration) || null,
  };
}

async function processVideo(ctx, file, probe) {
  const { s3, env, tmp } = ctx;

  // -ss past the end of a short clip exits 0 with no output, so check the
  // file landed rather than trusting the exit code.
  const posterTmp = path.join(tmp, `${file.hash}-poster.jpg`);
  await run('ffmpeg', ['-y', '-ss', '1', '-i', file.abs, '-frames:v', '1', '-q:v', '4', posterTmp]).catch(() => {});
  if (!(await stat(posterTmp).catch(() => null))) {
    await run('ffmpeg', ['-y', '-i', file.abs, '-frames:v', '1', '-q:v', '4', posterTmp]); // clips < 1s
  }

  // Passthrough when the browser can already play it; transcode otherwise.
  // -map_metadata -1 strips GPS/location from the container either way.
  const outTmp = path.join(tmp, `${file.hash}.mp4`);
  const h264 = probe.vcodec === 'h264';
  const audioOk = !probe.acodec || probe.acodec === 'aac' || probe.acodec === 'mp3';
  // -map: first video + first audio only — iPhone MOVs can carry a codec-less
  // "Core Media Metadata" track that ffmpeg misreads as audio and dies on.
  const args = ['-y', '-i', file.abs, '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-movflags', '+faststart'];
  if (h264 && audioOk) args.push('-c', 'copy');
  else if (h264) args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k');
  else args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-vf', "scale='min(1920,iw)':-2", '-c:a', 'aac', '-b:a', '128k');
  args.push(outTmp);
  await run('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });

  await uploadIfMissing(s3, env.R2_BUCKET, `poster/${swapExt(file.rel, '.jpg')}`, await readFile(posterTmp), 'image/jpeg');
  await uploadIfMissing(s3, env.R2_BUCKET, `video/${swapExt(file.rel, '.mp4')}`, await readFile(outTmp), 'video/mp4');
  await rm(posterTmp, { force: true });
  await rm(outTmp, { force: true });
}

/* ── Registration ────────────────────────────────────────────────────── */

async function registerBatch(env, items) {
  const res = await fetch(`${env.API_BASE}/api/admin/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ADMIN_TOKEN}` },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(120_000), // dead sockets fail instead of hanging the run
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/* ── Main ────────────────────────────────────────────────────────────── */

async function main() {
  const args = parseArgs();
  const env = await loadEnv();
  const manifest = await loadManifest();
  const s3 = makeS3(env);
  const tmp = await mkdtemp(path.join(tmpdir(), 'family-ingest-'));
  const ctx = { s3, env, tmp };

  let ffmpegOk = true;
  try {
    await run('ffprobe', ['-version']);
  } catch {
    ffmpegOk = false;
    console.warn('⚠ ffmpeg/ffprobe not found — videos will be SKIPPED (brew install ffmpeg)');
  }

  console.log(`Scanning ${args.dir} …`);
  const files = [];
  let skippedManifest = 0;
  let skippedDup = 0;
  // The drive's device dumps overlap heavily; the same file appears in several
  // folders. Same basename + same byte size = duplicate — first folder wins.
  // (Name alone is not enough: different phones reuse names like IMG_4714.)
  const seen = new Set();
  for await (const abs of walk(args.dir)) {
    const ext = path.extname(abs).toLowerCase();
    const kind = PHOTO_EXT.has(ext) ? 'photo' : VIDEO_EXT.has(ext) ? 'video' : null;
    if (!kind) continue;
    if (args.kind && kind !== args.kind) continue;
    if (kind === 'video' && !ffmpegOk) continue;
    const rel = path.relative(args.root, abs);
    if (rel.startsWith('..')) throw new Error(`${abs} is outside --root ${args.root}`);
    const st = await stat(abs);
    const dupKey = `${path.basename(rel).toLowerCase()}|${st.size}`;
    if (seen.has(dupKey)) {
      skippedDup++;
      continue;
    }
    seen.add(dupKey);
    const entry = manifest[rel];
    if (entry?.done && entry.mtime === st.mtimeMs && entry.size === st.size) {
      skippedManifest++;
      continue;
    }
    files.push({ abs, rel, kind, mtime: st.mtimeMs, size: st.size });
  }
  const photos = files.filter((f) => f.kind === 'photo').length;
  console.log(`${files.length} to process (${photos} photos, ${files.length - photos} videos), ${skippedManifest} already done, ${skippedDup} duplicates skipped`);
  if (args.dryRun) {
    for (const f of files.slice(0, 40)) console.log(`  would ingest ${f.kind}: ${f.rel}`);
    if (files.length > 40) console.log(`  … and ${files.length - 40} more`);
    return;
  }

  const pending = [];
  let processed = 0;

  // Serialized so concurrent pool workers can't interleave register calls
  // or manifest writes.
  let flushChain = Promise.resolve();
  function flushRegister(force = false) {
    flushChain = flushChain.then(async () => {
      while (pending.length >= REGISTER_BATCH || (force && pending.length)) {
        const batch = pending.splice(0, REGISTER_BATCH);
        const res = await registerBatch(env, batch.map(({ _file, ...item }) => item));
        for (const it of batch) {
          manifest[it._file.rel] = { mtime: it._file.mtime, size: it._file.size, done: true };
        }
        manifestDirty = true;
        await saveManifest(manifest);
        console.log(`  registered ${batch.length} (${res.inserted} new, ${res.skipped} known)`);
      }
    });
    return flushChain;
  }

  const failed = await pool(files, args.concurrency, async (file) => {
    file.hash = await sha256File(file.abs);

    let takenAt = null;
    let duration = null;
    try {
      const tags = await exiftool.read(file.abs);
      const dt = tags.DateTimeOriginal || tags.CreateDate || tags.MediaCreateDate;
      if (dt?.toDate) takenAt = Math.floor(dt.toDate().getTime() / 1000);
    } catch {}

    if (file.kind === 'photo') {
      await processPhoto(ctx, file);
    } else {
      const probe = await probeVideo(file.abs);
      duration = probe.duration;
      await processVideo(ctx, file, probe);
    }

    pending.push({
      rel_path: file.rel,
      kind: file.kind,
      content_hash: file.hash,
      duration_s: duration,
      taken_at: takenAt,
      _file: file,
    });
    processed++;
    if (processed % 25 === 0) console.log(`  ${processed}/${files.length} processed`);
    await flushRegister();
  });

  await flushRegister(true);
  await rm(tmp, { recursive: true, force: true });
  await exiftool.end();
  console.log(`Done: ${processed} ingested, ${failed} failed, ${skippedManifest} skipped (manifest).`);
  if (failed) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error(err);
  await exiftool.end().catch(() => {});
  process.exit(1);
});
