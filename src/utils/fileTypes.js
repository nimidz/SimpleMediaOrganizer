import { convertFileSrc } from '@tauri-apps/api/core';

export const DEFAULT_CATEGORIES = {
  image: {
    id: 'image',
    label: 'Images',
    icon: 'ImageIcon',
    color: '#a855f7',
    folderName: 'Images',
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif', '.raw', '.cr2', '.nef', '.avif'],
  },
  video: {
    id: 'video',
    label: 'Videos',
    icon: 'FilmIcon',
    color: '#ef4444',
    folderName: 'Videos',
    extensions: ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.m4v', '.3gp', '.ts', '.m2ts', '.vob'],
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    icon: 'MusicIcon',
    color: '#06b6d4',
    folderName: 'Audio',
    extensions: ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.opus', '.alac', '.aiff', '.mid', '.midi'],
  },
  document: {
    id: 'document',
    label: 'Documents',
    icon: 'FileTextIcon',
    color: '#3b82f6',
    folderName: 'Documents',
    extensions: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.csv', '.md', '.rtf', '.epub'],
  },
  archive: {
    id: 'archive',
    label: 'Archives',
    icon: 'ArchiveIcon',
    color: '#f59e0b',
    folderName: 'Archives',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.bz2', '.xz'],
  },
  app: {
    id: 'app',
    label: 'Applications',
    icon: 'LayersIcon',
    color: '#10b981',
    folderName: 'Applications',
    extensions: ['.exe', '.msi', '.apk'],
  },
  other: {
    id: 'other',
    label: 'Other Files',
    icon: 'FolderIcon',
    color: '#64748b',
    folderName: 'Other Files',
    extensions: ['.Unassigned (Extension)'],
    isUniversal: true,
  },
};

const STORAGE_KEY_CUSTOM_CATEGORIES = 'smo_custom_categories';

export function getCustomCategories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_CATEGORIES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Ensure any residual unwanted legacy categories are filtered out
    delete parsed.creative;
    delete parsed.code;
    delete parsed.ebook;
    delete parsed['e-books'];
    delete parsed['creative_design'];
    delete parsed['code_dev'];
    delete parsed['books_comics'];
    return parsed;
  } catch {
    return {};
  }
}

export function saveCustomCategories(categories) {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_CATEGORIES, JSON.stringify(categories));
  } catch (err) {
    console.error('Failed to save custom categories:', err);
  }
}

export function getAllCategories() {
  const custom = getCustomCategories();
  const merged = {};

  // 1. Process custom or user-modified categories FIRST so they take priority
  for (const [k, v] of Object.entries(custom)) {
    const isDefault = Boolean(DEFAULT_CATEGORIES[k]);
    merged[k] = {
      ...(DEFAULT_CATEGORIES[k] || {}),
      ...v,
      isCustom: !isDefault,
    };
  }

  // 2. Add remaining default categories if not already defined/overridden
  for (const [k, v] of Object.entries(DEFAULT_CATEGORIES)) {
    if (!merged[k]) {
      merged[k] = { ...v, isCustom: false };
    }
  }

  // 3. If a custom category claimed an extension (e.g. '.iso' in 'iso'),
  // remove that extension from other categories (e.g. removing '.iso' from 'archive')
  for (const [customKey, customMeta] of Object.entries(custom)) {
    if (Array.isArray(customMeta.extensions)) {
      const customExts = new Set(
        customMeta.extensions.map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
      );
      for (const [otherKey, otherMeta] of Object.entries(merged)) {
        if (otherKey !== customKey && Array.isArray(otherMeta.extensions)) {
          otherMeta.extensions = otherMeta.extensions.filter(
            (e) => !customExts.has(e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`)
          );
        }
      }
    }
  }

  if (merged.other) {
    merged.other.extensions = ['.Unassigned (Extension)'];
  }

  return merged;
}

export function getFileCategory(filename, customCategories = null) {
  if (!filename) return 'other';
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const categories = customCategories || getAllCategories();
  for (const [key, meta] of Object.entries(categories)) {
    if (key !== 'other' && Array.isArray(meta.extensions)) {
      const match = meta.extensions.some((e) => {
        const norm = e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`;
        return norm === ext;
      });
      if (match) return key;
    }
  }
  return 'other';
}

export function toMediaUrl(filePath) {
  if (!filePath) return '';
  if (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    return convertFileSrc(filePath);
  }
  return `media://local/?path=${encodeURIComponent(filePath)}`;
}
