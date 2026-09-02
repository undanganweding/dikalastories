#!/usr/bin/env node
/**
 * apply-ai-studio-export.mjs
 * ==========================
 * Aman menerapkan hasil export ZIP dari Google AI Studio ke project ini,
 * TANPA menimpa konfigurasi Vercel/Firebase yang sudah kita setup.
 *
 * Copy HANYA folder/pattern yang aman, LINDUNGI file-file yang jangan ditimpa.
 *
 * Usage:
 *   node apply-ai-studio-export.mjs "D:\Web\ai-studio-export"
 *   node apply-ai-studio-export.mjs "D:\Web\ai-studio-export" --preview   (hanya tampilkan, tidak copy)
 */

import fs from 'fs';
import path from 'path';

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
// Walk a directory, return relative file paths
// ---------------------------------------------------------------
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
// Main
// ---------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  let src = args.find(a => !a.startsWith('--'));
  const preview = args.includes('--preview');

  if (!src) {
    console.error('Usage: node apply-ai-studio-export.mjs "<folder export>" [--preview]');
    process.exit(1);
  }

  src = path.resolve(src);
  if (!fs.existsSync(src)) {
    console.error(`Folder export tidak ditemukan: ${src}`);
    process.exit(1);
  }

  const root = process.cwd();
  const allFiles = walk(src, src, []);

  const toCopy = allFiles.filter(shouldCopy);

  console.log(`\n>>> Sumber : ${src}`);
  console.log(`>>> Target : ${root}`);
  console.log(`>>> File   : ${toCopy.length}/${allFiles.length} akan di-copy`);
  console.log(`>>> Mode   : ${preview ? 'PREVIEW (tidak menulis)' : 'COPY'}\n`);

  if (toCopy.length === 0) {
    console.log('Tidak ada file yang perlu di-copy. Pastikan folder export berisi src/ atau server/.');
  }

  for (const f of toCopy) {
    const srcPath = path.join(src, f);
    const dstPath = path.join(root, f);
    console.log(`   ${f}`);
    if (!preview) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  console.log('\n>>> Selesai.');
  if (!preview) {
    console.log('>>> Langkah berikutnya:');
    console.log('   1. npm.cmd install          (kalau ada dependency baru)');
    console.log('   2. npm.cmd run dev          (tes lokal)');
    console.log('   3. .\\node_modules\\.bin\\tsx.cmd -r dotenv/config server/firestore_diagnostic.ts');
    console.log('   4. git diff                 (review, pastikan aman LALU commit & push)');
    console.log('   5. Vercel auto-deploy dari push.');
  }
}

main();
