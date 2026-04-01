#!/usr/bin/env node
// scripts/fetch_category_images.js
// Unsplash API からカテゴリ別画像 URL を取得して core/category-images.js を生成する
//
// Usage:
//   node scripts/fetch_category_images.js YOUR_ACCESS_KEY
//   UNSPLASH_ACCESS_KEY=xxx node scripts/fetch_category_images.js

import { writeFileSync } from 'fs';

const ACCESS_KEY = process.argv[2] || process.env.UNSPLASH_ACCESS_KEY;
if (!ACCESS_KEY) {
  console.error('Error: Unsplash Access Key が必要です。');
  console.error('Usage: node scripts/fetch_category_images.js YOUR_ACCESS_KEY');
  process.exit(1);
}

// カテゴリ ID → Unsplash 検索キーワード
const CATEGORY_QUERIES = {
  0:  'abstract minimal texture',
  1:  'action motion movement',
  2:  'thinking brainstorm communication',
  3:  'body fitness sport',
  4:  'people social community',
  5:  'science laboratory medicine',
  6:  'politics government architecture',
  7:  'business finance office',
  8:  'nature landscape forest',
  9:  'education library study',
  10: 'meditation philosophy mind',
  11: 'daily life culture city',
  12: 'technology computer digital',
  13: 'art music creative',
  14: 'time clock space',
  15: 'texture pattern surface',
  16: 'emotion portrait face',
  17: 'professional research data',
  18: 'balance scale quality',
};

const PER_PAGE = 10;
const API_BASE = 'https://api.unsplash.com';

async function fetchImages(categoryId, query) {
  const url = `${API_BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&orientation=portrait&content_filter=high`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Client-ID ${ACCESS_KEY}` },
  });

  if (res.status === 401) throw new Error('Access Key が無効です');
  if (res.status === 403) throw new Error('レートリミット超過');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  // regular サイズ（1080px 幅）を使用
  return data.results.map(p => p.urls.regular);
}

async function main() {
  console.log('Unsplash 画像取得開始...\n');
  const result = {};

  for (const [id, query] of Object.entries(CATEGORY_QUERIES)) {
    process.stdout.write(`  カテゴリ ${id.padStart(2)} (${query}) ... `);
    try {
      result[id] = await fetchImages(Number(id), query);
      console.log(`${result[id].length} 枚`);
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
      result[id] = [];
    }
    // Unsplash Demo 枠: 50 req/h → 200ms 間隔で安全マージン
    await new Promise(r => setTimeout(r, 250));
  }

  const js = `// core/category-images.js
// カテゴリ別 Unsplash 画像 URL（scripts/fetch_category_images.js で自動生成）
// Unsplash License: https://unsplash.com/license
// 再生成: node scripts/fetch_category_images.js YOUR_ACCESS_KEY

export const CATEGORY_IMAGES = ${JSON.stringify(result, null, 2)};
`;

  writeFileSync(new URL('../core/category-images.js', import.meta.url), js);
  console.log('\n✅ core/category-images.js を生成しました');

  const total = Object.values(result).reduce((s, a) => s + a.length, 0);
  console.log(`   合計: ${Object.keys(result).length} カテゴリ / ${total} 枚`);
}

main();
