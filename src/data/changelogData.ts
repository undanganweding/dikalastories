export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  badge?: string;
  changes: {
    type: 'feat' | 'fix' | 'infra' | 'perf';
    description: string;
  }[];
}

export const APP_CURRENT_VERSION = 'v1.4.0';

export const CHANGELOG_DATA: ReleaseNote[] = [
  {
    version: 'v1.4.0',
    date: '2 Sep 2026',
    title: 'Vercel Serverless Optimization & System Version Logger',
    badge: 'Latest',
    changes: [
      { type: 'feat', description: 'Integrasi System Version History & Changelog visualizer di dalam UI aplikasi.' },
      { type: 'infra', description: 'Vercel Ephemeral Storage Fallback (/tmp/data) untuk mencegah EROFS error jika Firestore belum diset.' },
      { type: 'fix', description: 'Fix Vercel serverless routing mismatch & Safe JSON error handler di frontend.' },
      { type: 'perf', description: 'Pembersihan bundler vercel.json untuk eksekusi serverless cepat.' },
    ],
  },
  {
    version: 'v1.3.0',
    date: '1 Sep 2026',
    title: 'Stop/Resume Engine & Multi-Key ARMO Router',
    changes: [
      { type: 'feat', description: 'Fitur Granular Pause/Resume untuk menghentikan dan melanjutkan pembuatan naskah di tengah jalan.' },
      { type: 'feat', description: 'Multi-Format Export & Import Proyek (File JSON lokal & Google Drive Cloud).' },
      { type: 'infra', description: 'ARMO Multi-API Key Router: Auto-cooldown & Load balancing saat kuota API terbatas (HTTP 429).' },
    ],
  },
  {
    version: 'v1.2.0',
    date: '30 Agt 2026',
    title: 'Cinematic Pipeline Phase 1 - Phase 8',
    changes: [
      { type: 'feat', description: 'Alur produksi otomatis lengkap: Story Architecture, Scene Breakdown, Shot Blueprint, hingga Asset Graph.' },
      { type: 'feat', description: 'Integrasi Google Drive Export/Import Modal dengan OAuth2.' },
    ],
  },
  {
    version: 'v1.1.0',
    date: '28 Agt 2026',
    title: 'Inisialisasi DikalaStories',
    changes: [
      { type: 'feat', description: 'Peluncuran awal arsitektur Studio Produksi Sinematik AI.' },
    ],
  },
];
