// app/ui-background.js — カード背景画像管理

import { CATEGORY_IMAGES } from '../core/category-images.js';

export class BackgroundManager {
  /**
   * セッション開始時にカテゴリの画像をブラウザにプリロードする。
   * @param {number[]} categoryIds
   */
  preload(categoryIds) {
    const seen = new Set();
    for (const id of categoryIds) {
      const urls = CATEGORY_IMAGES[id] ?? CATEGORY_IMAGES[0] ?? [];
      for (const url of urls) {
        if (!seen.has(url)) {
          seen.add(url);
          new Image().src = url;
        }
      }
    }
  }

  /**
   * カテゴリに対応するランダムな画像 URL を返す。
   * 対応画像がない場合は null を返す（背景なし）。
   * @param {number} categoryId
   * @returns {string|null}
   */
  getUrl(categoryId) {
    const urls = CATEGORY_IMAGES[categoryId] ?? CATEGORY_IMAGES[0] ?? [];
    if (urls.length === 0) return null;
    return urls[Math.floor(Math.random() * urls.length)];
  }
}
