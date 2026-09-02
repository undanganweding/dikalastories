#!/usr/bin/env node
/**
 * apply-ai-studio-export.mjs
 * ==========================
 * Smart round-trip dari hasil export ZIP Google AI Studio ke project ini.
 *
 * Fitur:
 *  - BISA nerima file .zip LANGSUNG (auto-extract ke folder temp) ATAU folder hasil ekstrak.
 *  - AUTO-DETECT: kalau dipanggil tanpa argumen, cari .zip terbaru di:
 *      1) Folder Downloads user
 *      2) Root project
 *      3) D:\Web\
 *  - Bandingkan hash file (export vs project) untuk DETEKSI file yang berubah.
 *  - Copy HANYA file source yang aman (src/, server/, dll) + file baru.
 *  - LINDUNGI file config penting (.env*, data/, vercel.json, api/index.ts,
 *    package.json, .gitignore, firebase-applet-config.json). (untuk package.json
 *    hanya MERGE dependencies, TIDAK menimpa build script kita).
 *  - Laporan ringkas per file: [BARU] / [UBAH] / [SAMA].
 *  - Opsi `--install` jalankan npm install, `--commit` jalankan git commit+push.
 *
 * Usage:
 *   node apply-ai-studio-export.mjs "<file.zip | folder export>" [--install] [--commit] [--message "msg"]
 *   node apply-ai-studio-export.mjs --preview                        (auto-detect zip terbaru)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

// ---------------------------------------------------------------
// 1) Daftar pattern yang BOLEH di-copy dari export AI Studio
// ---------------------------------------------------------------
const ALLOWED_SOURCES = [
  'src/**',
  'server/**',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tailwind.config.*',
  'postcss.config.*',
];

// ---------------------------------------------------------------
// 2) File yang JANGAN PERNAH ditimpa (config penting + rahasia)
// ---------------------------------------------------------------
const PROTECTED = [
  '.env', '.env.local', '.env.production', '.env.example',
  '.gitignore', '.git',
  'vercel.json',
  'api/index.ts',
  'firebase-applet-config.json',
  'package.json', 'package-lock.json', 'bun.lock',
  'push.bat',
  'data/**',
];

// ---------------------------------------------------------------
// Globs sederhana
// ---------------------------------------------------------------
function matchesGlob(file, glob) {
  const neg = glob.startsWith('!');
  if (neg) glob = glob.slice(1);

  const parts = glob.split('/');
  const fileParts = file.replace(/\\/g, '/').split('/');

  let ok = true;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p === '**') {
      // '**' matches zero or more segments; for simplicity treat as pass-through
      continue;
    }
    if (p.includes('*')) {
      const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');
      if (!re.test(fileParts[i])) { ok = false; break; }
    } else {
      if (fileParts[i] !== p) { ok = false; break; }
    }
  }
  return ok;
}

function shouldCopy(file) {
  // Protected first
  for (const p of PROTECTED) {
    if (matchesGlob(file, p)) return false;
  }
  // Then allowed
  for (const a of ALLOWED_SOURCES) {
    if (matchesGlob(file, a)) return true;
  }
  return false;
}

// ---------------------------------------------------------------
// Hash file (fast, SHA1)
// ---------------------------------------------------------------
function hashFile(p) {
  try {
    const h = createHash('sha1');
    h.update(fs.readFileSync(p));
    return h.digest('hex');
  } catch {
    return null;
  }
}

function walk(dir, base, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(full, base, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

// ---------------------------------------------------------------
// Merge dependencies dari package.json export -> project
// (TIDAK menimpa script build / vercel fix kita)
// ---------------------------------------------------------------
function mergeDependencies(exportDir, projectDir) {
  const expPkg = path.join(exportDir, 'package.json');
  const projPkg = path.join(projectDir, 'package.json');
  if (!fs.existsSync(expPkg) || !fs.existsSync(projPkg)) return null;

  const exp = JSON.parse(fs.readFileSync(expPkg, 'utf-8'));
  const proj = JSON.parse(fs.readFileSync(projPkg, 'utf-8'));

  const dropped = { dependencies: [], devDependencies: [] };
  let added = { dependencies: [], devDependencies: [] };

  for (const section of ['dependencies', 'devDependencies']) {
    if (exp[section]) {
      for (const [name, ver] of Object.entries(exp[section])) {
        if (!proj[section] || !proj[section][name]) {
          if (!proj[section]) proj[section] = {};
          proj[section][name] = ver;
          added[section].push(`${name}@${ver}`);
        } else if (proj[section][name] !== ver) {
          proj[section][name] = ver;
          added[section].push(`${name}@${ver}`);
        }
      }
    }
  }

  if (added.dependencies.length === 0 && added.devDependencies.length === 0) {
    return { changed: false, added };
  }

  fs.writeFileSync(projPkg, JSON.stringify(proj, null, 2) + '\n', 'utf-8');
  return { changed: true, added };
}

// ---------------------------------------------------------------
// Auto-detect .zip terbaru di folder umum
// ---------------------------------------------------------------
function getCandidateDirs() {
  const dirs = [];
  // 1) Downloads user
  try { dirs.push(path.join(os.homedir(), 'Downloads')); } catch {}
  // 2) Root project
  dirs.push(process.cwd());
  // 3) D:\Web\
  dirs.push('D:\\Web\\');
  // 4) AI Studio output folder
  dirs.push(path.join(process.cwd(), 'ai-studio-export'));
  return dirs;
}

function findNewestZip() {
  const candidates = [];
  for (const dir of getCandidateDirs()) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (name.toLowerCase().endsWith('.zip')) {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          candidates.push({ full, mtime: st.mtimeMs, name });
        } catch {}
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0];
}

// ---------------------------------------------------------------
// Ekstrak zip ke folder temp (pakai PowerShell Expand-Archive agar
// tidak tergantung library tambahan)
// ---------------------------------------------------------------
function extractZip(zipPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-studio-'));
  const zipAbs = path.resolve(zipPath);
  console.log(`  [ZIP] ${path.basename(zipPath)} -> ekstrak ke ${tmp}`);
  try {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipAbs}' -DestinationPath '${tmp}' -Force"`,
      { stdio: 'pipe' }
    );
    // Cari subfolder berisi package.json / src (zip kadang punya 1 folder pembungkus)
    const entries = fs.readdirSync(tmp);
    for (const e of entries) {
      const sub = path.join(tmp, e);
      if (fs.statSync(sub).isDirectory() && (fs.existsSync(path.join(sub, 'src')) || fs.existsSync(path.join(sub, 'server')) || fs.existsSync(path.join(sub, 'package.json')))) {
        return sub;
      }
    }
    return tmp;
  } catch (e) {
    console.error(`  [X] Gagal ekstrak zip: ${e.message}`);
    console.error('  Coba ekstrak manual, lalu jalankan dengan folder.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  let src = args.find(a => !a.startsWith('--'));
  const preview = args.includes('--preview');
  const wantInstall = args.includes('--install');
  const wantCommit = args.includes('--commit');
  const msgIdx = args.indexOf('--message');
  const commitMsg = msgIdx > -1 ? args[msgIdx + 1] : 'Update from AI Studio export';

  // Jika tidak ada argumen path, auto-detect zip terbaru
  if (!src) {
    const z = findNewestZip();
    if (z) {
      console.log(`  [AUTO] Tidak ada argumen. Pakai zip terbaru:`);
      console.log(`        ${z.full} (${new Date(z.mtime).toLocaleString()})`);
      src = z.full;
    } else {
      console.error('Tidak ada argumen dan tidak ketemu .zip. Beri path:');
      console.error('  node apply-ai-studio-export.mjs "<file.zip | folder>"');
      process.exit(1);
    }
  }

  src = path.resolve(src);

  // Jika input adalah file .zip, ekstrak dulu
  let isZip = fs.existsSync(src) && fs.statSync(src).isFile() && src.toLowerCase().endsWith('.zip');
  if (isZip) {
    src = extractZip(src);
  }

  if (!fs.existsSync(src)) {
    console.error(`Folder export tidak ditemukan: ${src}`);
    process.exit(1);
  }

  const root = process.cwd();
  const allFiles = walk(src, src, []);
  const copyable = allFiles.filter(shouldCopy);

  console.log('='.repeat(64));
  console.log('  AI Studio Export -> Project Lokal');
  console.log('='.repeat(64));
  console.log(`  Sumber : ${src}`);
  console.log(`  Target : ${root}`);
  console.log(`  Mode   : ${preview ? 'PREVIEW' : 'COPY'}\n`);

  const changed = [];
  const same = [];

  for (const f of copyable) {
    const srcPath = path.join(src, f);
    const dstPath = path.join(root, f);
    let status;
    if (!fs.existsSync(dstPath)) {
      status = 'BARU';
    } else {
      const h1 = hashFile(srcPath);
      const h2 = hashFile(dstPath);
      status = h1 === h2 ? 'SAMA' : 'UBAH';
    }
    if (status === 'SAMA') same.push(f);
    else changed.push({ f, srcPath, dstPath, status });
  }

  console.log(`  Deteksi: ${changed.length} berubah/baru, ${same.length} sama.\n`);

  if (changed.length === 0) {
    console.log('  Tidak ada file yang berubah. Project sudah sinkron.');
  } else {
    for (const { f, status } of changed) {
      console.log(`  [${status}] ${f}`);
    }
  }

  if (!preview && changed.length > 0) {
    console.log('\n  >>> Menyalin file...');
    for (const { srcPath, dstPath } of changed) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
    console.log(`  >>> Copied: ${changed.length} file(s).`);
  }

  // Merge package.json dependencies (hanya jika ada file export package.json)
  const mergeResult = mergeDependencies(src, root);
  if (mergeResult?.changed) {
    console.log('\n  >>> [package.json] Dependency BARU/tambahan di-merge:');
    for (const [sec, list] of Object.entries(mergeResult.added)) {
      if (list.length) console.log(`       ${sec}: ${list.join(', ')}`);
    }
    console.log('       (build script & vercel fix TETAP dipertahankan)');
  } else if (mergeResult) {
    console.log('\n  >>> [package.json] Tidak ada dependency baru.');
  }

  if (preview) {
    console.log('\n  >>> (PREVIEW) tidak ada yang ditulis.\n');
    return;
  }

  // Optional: npm install
  if (wantInstall) {
    console.log('\n  >>> Menjalankan npm install...');
    try {
      execSync('npm.cmd install', { stdio: 'inherit', cwd: root });
    } catch {
      console.warn('  >>> npm install ada issue (non-fatal). Lanjut...');
    }
  }

  // Optional: git commit + push
  if (wantCommit) {
    console.log(`\n  >>> Git: add, commit "${commitMsg}", push...`);
    try {
      execSync('git add -A', { stdio: 'inherit', cwd: root });
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { stdio: 'inherit', cwd: root });
      execSync('git push origin main', { stdio: 'inherit', cwd: root });
      console.log('  >>> Push sukses. Vercel auto-deploy.');
    } catch {
      console.warn('  >>> Git commit/push gagal. Cek pesan di atas. (bisa karena tidak ada perubahan / perlu login)');
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log('  Selesai.');
  if (!wantCommit) {
    console.log('  Langkah lanjut (manual):');
    console.log('   1. npm.cmd install');
    console.log('   2. npm.cmd run dev');
    console.log('   3. .\\node_modules\\.bin\\tsx.cmd -r dotenv/config server/firestore_diagnostic.ts');
    console.log('   4. git diff && git add -A && git commit -m "..." && git push origin main');
  }
  console.log('='.repeat(64));
}

main();
