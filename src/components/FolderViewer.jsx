import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Search,
  ExternalLink,
  Trash2,
  Edit2,
  FolderOpen,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  Play,
  CheckSquare,
  Square,
  RefreshCw,
  Copy,
  Scissors,
  Eye,
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';
import { toMediaUrl, getFileCategory, getAllCategories } from '../utils/fileTypes';
import MediaThumbnail from './MediaThumbnail';

export default function FolderViewer({
  folderPath,
  folderName,
  initialCategory = 'all',
  categories = {},
  onBack,
  onOpenLightbox,
  onPlayAudio,
}) {
  const activeCategories = useMemo(() => {
    return categories && Object.keys(categories).length > 0 ? categories : getAllCategories();
  }, [categories]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'all');
  const [gridSize, setGridSize] = useState(() => {
    try {
      return (
        localStorage.getItem('smo_viewer_grid_size') ||
        localStorage.getItem('smo_review_grid_size') ||
        'medium'
      );
    } catch {
      return 'medium';
    }
  }); // 'small' | 'medium' | 'large'

  useEffect(() => {
    try {
      localStorage.setItem('smo_viewer_grid_size', gridSize);
      localStorage.setItem('smo_review_grid_size', gridSize);
    } catch {}
  }, [gridSize]);

  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [clipboardStatus, setClipboardStatus] = useState('');

  // Context Menu state
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    item: null,
  });

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape' && contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [contextMenu.visible]);

  const handleContextMenu = (item, e) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 220;
    const menuHeight = 280;
    const posX = e.clientX + menuWidth > window.innerWidth ? window.innerWidth - menuWidth - 10 : e.clientX;
    const posY = e.clientY + menuHeight > window.innerHeight ? window.innerHeight - menuHeight - 10 : e.clientY;
    setContextMenu({
      visible: true,
      x: Math.max(10, posX),
      y: Math.max(10, posY),
      item,
    });
  };

  const loadFolder = async () => {
    setLoading(true);
    if (window.electronAPI) {
      const res = await window.electronAPI.readFolder(folderPath, activeCategories);
      if (res && res.success) {
        const normalized = (res.items || []).map((item) => ({
          ...item,
          category: item.isDirectory ? 'folder' : getFileCategory(item.name, activeCategories),
        }));
        setItems(normalized);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadFolder();
    setSelectedPaths(new Set());
    setSelectedCategory(initialCategory || 'all');
  }, [folderPath, initialCategory, activeCategories]);

  const categoryCounts = useMemo(() => {
    const counts = { all: items.length };
    for (const item of items) {
      const cat = item.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [items, searchQuery, selectedCategory]);

  // Toggle selection
  const toggleSelect = (path, e) => {
    e?.stopPropagation();
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const selectAll = () => {
    if (selectedPaths.size === filteredItems.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredItems.map((i) => i.path)));
    }
  };

  // Native Copy / Cut to Windows Explorer clipboard
  const handleCopyClipboard = async (isCut = false, specificPaths = null) => {
    const targets =
      specificPaths ||
      (selectedPaths.size > 0
        ? Array.from(selectedPaths)
        : filteredItems[focusedIndex]
        ? [filteredItems[focusedIndex].path]
        : []);

    if (targets.length === 0) return;

    if (window.electronAPI) {
      await window.electronAPI.copyFilesToClipboard(targets, isCut);
      setClipboardStatus(isCut ? `Cut ${targets.length} file(s) to Windows Clipboard` : `Copied ${targets.length} file(s) to Windows Clipboard`);
      setTimeout(() => setClipboardStatus(''), 3000);
    }
  };

  // Delete file to recycle bin
  const handleDelete = async (targetPaths, e) => {
    e?.stopPropagation();
    const paths = Array.isArray(targetPaths) ? targetPaths : [targetPaths];
    if (paths.length === 0) return;

    const countText = paths.length === 1 ? 'this file' : `${paths.length} files`;
    if (window.confirm(`Move ${countText} to Windows Recycle Bin?`)) {
      for (const p of paths) {
        await window.electronAPI?.deleteFile(p);
      }
      setItems((prev) => prev.filter((i) => !paths.includes(i.path)));
      setSelectedPaths(new Set());
    }
  };

  // Start rename
  const startRename = (item, e) => {
    e?.stopPropagation();
    setRenameTarget(item);
    setRenameValue(item.name);
  };

  // Submit rename
  const submitRename = async (e) => {
    e?.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    const dir = folderPath;
    const newPath = `${dir}\\${renameValue.trim()}`;

    const res = await window.electronAPI?.renameFile(renameTarget.path, newPath);
    if (res?.success) {
      loadFolder();
      setRenameTarget(null);
    } else {
      alert('Failed to rename: ' + (res?.error || ''));
    }
  };

  const handleItemClick = (item) => {
    if (item.category === 'image' || item.category === 'video') {
      onOpenLightbox(item, filteredItems);
    } else if (item.category === 'audio') {
      onPlayAudio(item);
    } else if (item.isDirectory) {
      window.electronAPI?.revealInExplorer(item.path);
    } else {
      window.electronAPI?.openPath(item.path);
    }
  };

  // Global Keyboard Shortcuts (Space, F2, Delete, Ctrl+C, Ctrl+X, Ctrl+A)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in search or rename input
      if (e.target.tagName === 'INPUT') return;

      const currentItem = filteredItems[focusedIndex];

      if (e.key === ' ' || e.code === 'Space') {
        // Spacebar -> Quick Look
        e.preventDefault();
        if (currentItem) {
          handleItemClick(currentItem);
        }
      } else if (e.key === 'F2') {
        // F2 -> Rename
        e.preventDefault();
        if (currentItem) {
          startRename(currentItem);
        }
      } else if (e.key === 'Delete') {
        // Delete -> Recycle Bin
        e.preventDefault();
        const targets = selectedPaths.size > 0 ? Array.from(selectedPaths) : currentItem ? [currentItem.path] : [];
        if (targets.length > 0) {
          handleDelete(targets);
        }
      } else if (e.key === 'a' && e.ctrlKey) {
        // Ctrl+A -> Select All
        e.preventDefault();
        selectAll();
      } else if (e.key === 'c' && e.ctrlKey) {
        // Ctrl+C -> Native Copy
        e.preventDefault();
        handleCopyClipboard(false);
      } else if (e.key === 'x' && e.ctrlKey) {
        // Ctrl+X -> Native Cut
        e.preventDefault();
        handleCopyClipboard(true);
      } else if (e.key === 'ArrowRight') {
        setFocusedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, filteredItems, selectedPaths]);

  return (
    <div className="page-content folder-viewer-page">
      {/* Breadcrumb Bar */}
      <div className="viewer-header-bar">
        <div className="viewer-breadcrumb-left">
          <button className="fluent-button" onClick={onBack} title="Back to Review Media">
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <div className="viewer-folder-info">
            <h2 className="viewer-title">{folderName}</h2>
            <span className="viewer-subtitle" title={folderPath}>
              {folderPath} • {filteredItems.length} items
            </span>
          </div>
        </div>

        <div className="viewer-actions-right">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="fluent-input"
              placeholder="Filter items in this folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Grid Size Selector */}
          <div className="size-selector-pills">
            <button
              className={`size-pill ${gridSize === 'small' ? 'active' : ''}`}
              onClick={() => setGridSize('small')}
              title="Small Grid"
            >
              S
            </button>
            <button
              className={`size-pill ${gridSize === 'medium' ? 'active' : ''}`}
              onClick={() => setGridSize('medium')}
              title="Medium Grid"
            >
              M
            </button>
            <button
              className={`size-pill ${gridSize === 'large' ? 'active' : ''}`}
              onClick={() => setGridSize('large')}
              title="Large Grid"
            >
              L
            </button>
          </div>

          <button
            className="fluent-button"
            onClick={selectAll}
            title={selectedPaths.size === filteredItems.length ? 'Deselect All (Ctrl+A)' : 'Select All (Ctrl+A)'}
          >
            {selectedPaths.size === filteredItems.length && filteredItems.length > 0 ? (
              <CheckSquare size={16} />
            ) : (
              <Square size={16} />
            )}
            <span>{selectedPaths.size > 0 ? `${selectedPaths.size} Selected` : 'Select All'}</span>
          </button>

          {/* Native Clipboard Buttons */}
          <button
            className="fluent-button"
            onClick={() => handleCopyClipboard(false)}
            title="Copy to Windows Clipboard (Ctrl+C)"
          >
            <Copy size={15} />
            <span>Copy</span>
          </button>

          <button
            className="fluent-button"
            onClick={() => handleCopyClipboard(true)}
            title="Cut to Windows Clipboard (Ctrl+X)"
          >
            <Scissors size={15} />
            <span>Cut</span>
          </button>

          {selectedPaths.size > 0 && (
            <button
              className="fluent-button danger-btn"
              onClick={() => handleDelete(Array.from(selectedPaths))}
              title="Delete selected files (Delete)"
            >
              <Trash2 size={15} />
              <span>Delete</span>
            </button>
          )}

          <button className="fluent-button" onClick={loadFolder} title="Refresh Folder">
            <RefreshCw size={15} />
          </button>

          <button
            className="fluent-button"
            onClick={() => window.electronAPI?.revealInExplorer(folderPath)}
            title="Open in Windows Explorer"
          >
            <FolderOpen size={16} />
            <span>Explorer</span>
          </button>
        </div>
      </div>

      {/* Category Filter Tabs inside Folder */}
      <div className="viewer-category-toolbar">
        <button
          className={`review-tab-btn ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          <span>All Media ({categoryCounts.all || 0})</span>
        </button>
        {Object.entries(activeCategories).map(([catId, catMeta]) => {
          const count = categoryCounts[catId] || 0;
          if (count === 0 && selectedCategory !== catId) return null;
          return (
            <button
              key={catId}
              className={`review-tab-btn ${selectedCategory === catId ? 'active' : ''}`}
              onClick={() => setSelectedCategory(catId)}
            >
              <span>{catMeta.label} ({count})</span>
            </button>
          );
        })}
      </div>

      {clipboardStatus && (
        <div className="status-toast-bar">
          <span>{clipboardStatus}</span>
        </div>
      )}

      {/* Grid of Files */}
      {loading ? (
        <div className="viewer-loading">
          <div className="spinner-mini large"></div>
          <p>Reading files...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <ImageIcon size={48} className="empty-icon" />
          <h3>This folder is empty</h3>
        </div>
      ) : (
        <div className={`media-files-grid size-${gridSize}`}>
          {filteredItems.map((item, idx) => {
            const isSelected = selectedPaths.has(item.path);
            const isFocused = focusedIndex === idx;
            const isImage = item.category === 'image';
            const isVideo = item.category === 'video';
            const isAudio = item.category === 'audio';

            return (
              <div
                key={item.path}
                className={`media-file-card ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                onClick={() => {
                  setFocusedIndex(idx);
                  handleItemClick(item);
                }}
                onContextMenu={(e) => handleContextMenu(item, e)}
                draggable="true"
                onDragStart={(e) => {
                  e.preventDefault();
                  const targets = selectedPaths.has(item.path) && selectedPaths.size > 1
                    ? Array.from(selectedPaths)
                    : [item.path];
                  window.electronAPI?.startDrag(targets);
                }}
                title={`${item.name}\nSize: ${formatBytes(item.size)}\nDrag to Windows Explorer or other apps\nRight-click for options`}
              >
                {/* Selection Checkbox */}
                <div
                  className="media-card-checkbox"
                  onClick={(e) => toggleSelect(item.path, e)}
                >
                  {isSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                </div>

                {/* Media Thumbnail */}
                <div className="media-thumbnail-box">
                  <MediaThumbnail item={item} onPlayAudio={onPlayAudio} />
                </div>

                {/* File Info */}
                <div className="media-file-info">
                  <div className="media-file-name" title={item.name}>
                    {item.name}
                  </div>
                  <div className="media-file-sub">
                    <span>{formatBytes(item.size)}</span>
                    <span>{formatDate(item.mtimeMs).split(',')[0]}</span>
                  </div>
                </div>

                {/* Quick Action Hover Bar */}
                <div className="media-card-actions">
                  <button
                    className="quick-act-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(item);
                    }}
                    title="Quick Look (Spacebar)"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    className="quick-act-btn"
                    onClick={(e) => startRename(item, e)}
                    title="Rename (F2)"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="quick-act-btn danger"
                    onClick={(e) => handleDelete(item.path, e)}
                    title="Delete to Recycle Bin (Delete)"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className="quick-act-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.electronAPI?.revealInExplorer(item.path);
                    }}
                    title="Reveal in Explorer"
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename Dialog Modal */}
      {renameTarget && (
        <div className="modal-backdrop" onClick={() => setRenameTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Rename File</h3>
            <form onSubmit={submitRename}>
              <input
                type="text"
                className="fluent-input rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="fluent-button"
                  onClick={() => setRenameTarget(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="fluent-button primary">
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Right Click Context Menu */}
      {contextMenu.visible && contextMenu.item && (
        <div
          className="fluent-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              handleItemClick(contextMenu.item);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Eye size={15} />
            <span>Open / Quick Look</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              window.electronAPI?.revealInExplorer(contextMenu.item.path);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <ExternalLink size={15} />
            <span>Reveal in File Explorer</span>
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item"
            onClick={() => {
              handleCopyClipboard(false, [contextMenu.item.path]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Copy size={15} />
            <span>Copy (Ctrl+C)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              handleCopyClipboard(true, [contextMenu.item.path]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Scissors size={15} />
            <span>Cut (Ctrl+X)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              startRename(contextMenu.item);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Edit2 size={15} />
            <span>Rename (F2)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              toggleSelect(contextMenu.item.path);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <CheckSquare size={15} />
            <span>{selectedPaths.has(contextMenu.item.path) ? 'Deselect' : 'Select'}</span>
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item danger"
            onClick={() => {
              handleDelete([contextMenu.item.path]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Trash2 size={15} />
            <span>Delete to Recycle Bin</span>
          </button>
        </div>
      )}
    </div>
  );
}
