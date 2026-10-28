import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  Search,
  Grid,
  List as ListIcon,
  Folder,
  ArrowUpDown,
  ExternalLink,
  Disc,
  CheckSquare,
  Square,
  Copy,
  Scissors,
  Trash2,
  Edit2,
  FolderOpen,
  X,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import MediaThumbnail from './MediaThumbnail';

export default function ReviewMedia({
  folders = [],
  onFoldersChange,
  activeCategory,
  setActiveCategory,
  categories,
  onOpenFolder,
  onPlayAudio,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('smo_review_view_mode') || 'grid';
    } catch {
      return 'grid';
    }
  }); // 'grid' | 'list'
  const [gridSize, setGridSize] = useState(() => {
    try {
      return localStorage.getItem('smo_review_grid_size') || 'medium';
    } catch {
      return 'medium';
    }
  }); // 'small' | 'medium' | 'large'
  const [sortBy, setSortBy] = useState(() => {
    try {
      return localStorage.getItem('smo_review_sort_by') || 'count';
    } catch {
      return 'count';
    }
  }); // 'count' | 'name' | 'size'

  // Persist view preferences across folder navigation
  useEffect(() => {
    try {
      localStorage.setItem('smo_review_view_mode', viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem('smo_review_grid_size', gridSize);
    } catch {}
  }, [gridSize]);

  useEffect(() => {
    try {
      localStorage.setItem('smo_review_sort_by', sortBy);
    } catch {}
  }, [sortBy]);

  // Multi-selection state
  const [selectedPaths, setSelectedPaths] = useState(new Set());

  // Context Menu state
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    folder: null,
  });

  // Modal states
  const [deleteTargetFolders, setDeleteTargetFolders] = useState(null); // array of folder objects
  const [renameTargetFolder, setRenameTargetFolder] = useState(null); // folder object
  const [newFolderName, setNewFolderName] = useState('');
  const [statusToast, setStatusToast] = useState('');

  const toastTimerRef = useRef(null);
  const showToast = (msg) => {
    setStatusToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setStatusToast(''), 3000);
  };

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu.visible) setContextMenu((prev) => ({ ...prev, visible: false }));
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setDeleteTargetFolders(null);
        setRenameTargetFolder(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.visible]);

  // Build category tabs list from available categories
  const categoryTabs = useMemo(() => {
    const list = [{ id: 'all', label: 'All Media' }];
    for (const [id, meta] of Object.entries(categories)) {
      list.push({ id, label: meta.label });
    }
    return list;
  }, [categories]);

  // Filter and sort folders based on selected tab and search
  const filteredFolders = useMemo(() => {
    return folders
      .filter((f) => {
        const matchCategory =
          activeCategory === 'all'
            ? f.totalFiles > 0
            : (f.counts?.[activeCategory] || 0) > 0;

        const matchSearch =
          !searchQuery.trim() ||
          f.folderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.folderPath.toLowerCase().includes(searchQuery.toLowerCase());

        return matchCategory && matchSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'count') {
          const countA = activeCategory === 'all' ? a.totalFiles : a.counts?.[activeCategory] || 0;
          const countB = activeCategory === 'all' ? b.totalFiles : b.counts?.[activeCategory] || 0;
          return countB - countA;
        }
        if (sortBy === 'name') {
          return a.folderName.localeCompare(b.folderName);
        }
        if (sortBy === 'size') {
          return b.totalSize - a.totalSize;
        }
        return 0;
      });
  }, [folders, activeCategory, searchQuery, sortBy]);

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

  const handleSelectAll = () => {
    if (selectedPaths.size === filteredFolders.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredFolders.map((f) => f.folderPath)));
    }
  };

  // Copy / Cut to Windows Explorer Clipboard
  const handleCopy = (isCut = false, specificPaths = null) => {
    const paths = specificPaths || Array.from(selectedPaths);
    if (paths.length === 0) return;

    if (window.electronAPI?.copyFilesToClipboard) {
      window.electronAPI.copyFilesToClipboard(paths, isCut).then(() => {
        showToast(
          isCut
            ? `Cut ${paths.length} folder(s) to Windows Clipboard (Paste in Explorer with Ctrl+V)`
            : `Copied ${paths.length} folder(s) to Windows Clipboard (Paste in Explorer with Ctrl+V)`
        );
      }).catch((err) => {
        console.error('Clipboard copy error:', err);
      });
    }
  };

  // Open context menu
  const handleContextMenu = (folder, e) => {
    e.preventDefault();
    e.stopPropagation();

    // If right clicked folder isn't in selection, select it exclusively
    if (!selectedPaths.has(folder.folderPath)) {
      setSelectedPaths(new Set([folder.folderPath]));
    }

    const mouseX = Math.min(e.clientX, window.innerWidth - 230);
    const mouseY = Math.min(e.clientY, window.innerHeight - 280);

    setContextMenu({
      visible: true,
      x: mouseX,
      y: mouseY,
      folder,
    });
  };

  // Delete folder(s)
  const confirmDeleteFolders = (foldersToDelete) => {
    setDeleteTargetFolders(foldersToDelete);
  };

  const executeDeleteFolders = async () => {
    if (!deleteTargetFolders || deleteTargetFolders.length === 0) return;

    const pathsToDelete = new Set(deleteTargetFolders.map((f) => f.folderPath));
    for (const folder of deleteTargetFolders) {
      if (window.electronAPI?.deleteFile) {
        await window.electronAPI.deleteFile(folder.folderPath);
      }
    }

    if (onFoldersChange) {
      onFoldersChange((prev) => prev.filter((f) => !pathsToDelete.has(f.folderPath)));
    }

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      pathsToDelete.forEach((p) => next.delete(p));
      return next;
    });

    showToast(`Moved ${deleteTargetFolders.length} folder(s) to Recycle Bin.`);
    setDeleteTargetFolders(null);
  };

  // Rename folder
  const startRenameFolder = (folder) => {
    setRenameTargetFolder(folder);
    setNewFolderName(folder.folderName);
  };

  const executeRenameFolder = async () => {
    if (!renameTargetFolder || !newFolderName.trim() || newFolderName === renameTargetFolder.folderName) {
      setRenameTargetFolder(null);
      return;
    }

    const oldPath = renameTargetFolder.folderPath;
    const parent = oldPath.substring(0, Math.max(oldPath.lastIndexOf('\\'), oldPath.lastIndexOf('/')));
    const sep = oldPath.includes('/') ? '/' : '\\';
    const newPath = `${parent}${sep}${newFolderName.trim()}`;

    if (window.electronAPI?.renameFile) {
      const res = await window.electronAPI.renameFile(oldPath, newPath);
      if (res && res.success) {
        if (onFoldersChange) {
          onFoldersChange((prev) =>
            prev.map((f) =>
              f.folderPath === oldPath
                ? { ...f, folderName: newFolderName.trim(), folderPath: newPath }
                : f
            )
          );
        }
        showToast(`Renamed folder to "${newFolderName.trim()}".`);
      } else {
        showToast(`Rename failed: ${res?.error || 'Unknown error'}`);
      }
    }

    setRenameTargetFolder(null);
  };

  // Global keyboard shortcuts (Ctrl+C, Ctrl+X, Delete)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (renameTargetFolder || deleteTargetFolders) return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedPaths.size > 0) {
        e.preventDefault();
        handleCopy(false);
      } else if (e.key === 'x' && (e.ctrlKey || e.metaKey) && selectedPaths.size > 0) {
        e.preventDefault();
        handleCopy(true);
      } else if (e.key === 'Delete' && selectedPaths.size > 0) {
        e.preventDefault();
        const targets = folders.filter((f) => selectedPaths.has(f.folderPath));
        confirmDeleteFolders(targets);
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSelectAll();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPaths, folders, renameTargetFolder, deleteTargetFolders, filteredFolders]);

  return (
    <div className="page-content review-media-page">
      {/* Top Filter & Toolbar */}
      <div className="review-toolbar">
        {/* Category Tabs */}
        <div className="review-tabs">
          {categoryTabs.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                className={`review-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(tab.id);
                  setSelectedPaths(new Set());
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search, Sort, Size, and View Controls */}
        <div className="review-controls">
          <div className="search-box">
            <Search size={15} className="search-icon" />
            <input
              type="text"
              className="fluent-input search-input"
              placeholder="Search folder name or path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="sort-box">
            <ArrowUpDown size={15} className="text-secondary" />
            <select
              className="fluent-input sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="count">Sort: Most Files</option>
              <option value="size">Sort: Largest Size</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
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

          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid size={16} />
            </button>
            <button
              className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Batch Folder Actions Bar (Appears when folders are selected) */}
      {selectedPaths.size > 0 && (
        <div className="folder-batch-toolbar">
          <div className="folder-batch-left">
            <button className="fluent-button" onClick={handleSelectAll}>
              <CheckSquare size={15} className="text-accent" />
              <span>
                {selectedPaths.size === filteredFolders.length ? 'Deselect All' : `Select All (${filteredFolders.length})`}
              </span>
            </button>
            <span className="selected-counter-badge">
              {selectedPaths.size} folder(s) selected
            </span>
          </div>

          <div className="folder-batch-right">
            <button
              className="fluent-button"
              onClick={() => handleCopy(false)}
              title="Copy selected folders to Windows Clipboard (Ctrl+C)"
            >
              <Copy size={15} />
              <span>Copy</span>
            </button>

            <button
              className="fluent-button"
              onClick={() => handleCopy(true)}
              title="Cut selected folders to Windows Clipboard (Ctrl+X)"
            >
              <Scissors size={15} />
              <span>Cut</span>
            </button>

            <button
              className="fluent-button danger-btn"
              onClick={() => {
                const targets = folders.filter((f) => selectedPaths.has(f.folderPath));
                confirmDeleteFolders(targets);
              }}
              title="Move selected folders to Recycle Bin (Delete)"
            >
              <Trash2 size={15} />
              <span>Delete</span>
            </button>

            <button
              className="fluent-button"
              onClick={() => setSelectedPaths(new Set())}
              title="Clear selection"
            >
              <X size={15} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification Bar */}
      {statusToast && (
        <div className="status-toast-bar">
          <Check size={14} className="text-emerald" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* Folders Aggregator Grid */}
      {filteredFolders.length === 0 ? (
        <div className="empty-state">
          <Folder size={48} className="empty-icon" />
          <h3>No media folders found</h3>
          <p>
            {folders.length === 0
              ? 'Start scanning a drive or select a custom folder from the Dashboard.'
              : 'No folders match the selected category or search query.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className={`folder-grid size-${gridSize}`}>
          {filteredFolders.map((folder) => {
            const count =
              activeCategory === 'all'
                ? folder.totalFiles
                : folder.counts?.[activeCategory] || 0;

            const previewItem =
              activeCategory === 'image'
                ? folder.latestImage
                : activeCategory === 'video'
                ? folder.latestVideo
                : activeCategory === 'audio'
                ? folder.latestAudio
                : activeCategory === 'all'
                ? folder.latestImage || folder.latestVideo || folder.latestAudio || folder.latestItem
                : folder.latestItem;

            const isSelected = selectedPaths.has(folder.folderPath);

            return (
              <div
                key={folder.folderPath}
                className={`folder-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onOpenFolder(folder.folderPath, folder.folderName, activeCategory)}
                onContextMenu={(e) => handleContextMenu(folder, e)}
                draggable="true"
                onDragStart={(e) => {
                  e.preventDefault();
                  const targets = selectedPaths.has(folder.folderPath) && selectedPaths.size > 1
                    ? Array.from(selectedPaths)
                    : [folder.folderPath];
                  window.electronAPI?.startDrag(targets);
                }}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpenFolder(folder.folderPath, folder.folderName, activeCategory);
                  if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
                    e.stopPropagation();
                    handleCopy(false, [folder.folderPath]);
                  }
                  if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
                    e.stopPropagation();
                    handleCopy(true, [folder.folderPath]);
                  }
                  if (e.key === 'F2') {
                    e.stopPropagation();
                    startRenameFolder(folder);
                  }
                  if (e.key === 'Delete') {
                    e.stopPropagation();
                    confirmDeleteFolders([folder]);
                  }
                }}
                title={`${folder.folderName} (${count} files)\nRight click for more options\nDrag to copy into Windows Explorer`}
              >
                {/* Selection Checkbox */}
                <div
                  className="folder-card-checkbox"
                  onClick={(e) => toggleSelect(folder.folderPath, e)}
                  title={isSelected ? 'Deselect folder' : 'Select folder'}
                >
                  {isSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                </div>

                {/* Thumbnail Preview Area */}
                <div className="folder-preview-area">
                  {previewItem ? (
                    <MediaThumbnail
                      key={previewItem.path}
                      item={previewItem}
                      className="folder-preview-img"
                      onPlayAudio={onPlayAudio}
                    />
                  ) : (
                    <div className="folder-fallback-icon">
                      {activeCategory === 'video' ? (
                        <Film size={36} className="text-red" />
                      ) : activeCategory === 'audio' ? (
                        <Music size={36} className="text-cyan" />
                      ) : activeCategory === 'document' ? (
                        <FileText size={36} className="text-blue" />
                      ) : activeCategory === 'iso' ? (
                        <Disc size={36} className="text-cyan" />
                      ) : (
                        <Folder size={36} className="text-accent" />
                      )}
                    </div>
                  )}

                  {/* Count badge */}
                  <span className="folder-badge-count">{count}</span>
                </div>

                {/* Card Title & Meta (Folder (X) style) */}
                <div className="folder-card-meta">
                  <div className="folder-title" title={folder.folderName}>
                    {folder.folderName} ({count})
                  </div>
                  <div className="folder-path-sub" title={folder.folderPath}>
                    {formatBytes(folder.totalSize)} • {folder.folderPath}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="folder-list">
          {filteredFolders.map((folder) => {
            const count =
              activeCategory === 'all'
                ? folder.totalFiles
                : folder.counts?.[activeCategory] || 0;
            const isSelected = selectedPaths.has(folder.folderPath);

            return (
              <div
                key={folder.folderPath}
                className={`folder-list-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onOpenFolder(folder.folderPath, folder.folderName, activeCategory)}
                onContextMenu={(e) => handleContextMenu(folder, e)}
                draggable="true"
                onDragStart={(e) => {
                  e.preventDefault();
                  const targets = selectedPaths.has(folder.folderPath) && selectedPaths.size > 1
                    ? Array.from(selectedPaths)
                    : [folder.folderPath];
                  window.electronAPI?.startDrag(targets);
                }}
              >
                {/* Selection Checkbox in List */}
                <div
                  className="folder-list-checkbox"
                  onClick={(e) => toggleSelect(folder.folderPath, e)}
                >
                  {isSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                </div>

                <div className="folder-list-icon">
                  {activeCategory === 'video' ? (
                    <Film size={22} className="text-red" />
                  ) : activeCategory === 'audio' ? (
                    <Music size={22} className="text-cyan" />
                  ) : activeCategory === 'image' ? (
                    <ImageIcon size={22} className="text-purple" />
                  ) : activeCategory === 'document' ? (
                    <FileText size={22} className="text-blue" />
                  ) : activeCategory === 'iso' ? (
                    <Disc size={22} className="text-cyan" />
                  ) : (
                    <Folder size={22} className="text-accent" />
                  )}
                </div>

                <div className="folder-list-name-col">
                  <div className="folder-list-title">
                    {folder.folderName} <span>({count})</span>
                  </div>
                  <div className="folder-list-path">{folder.folderPath}</div>
                </div>

                <div className="folder-list-size">{formatBytes(folder.totalSize)}</div>

                <button
                  className="folder-list-open-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.revealInExplorer(folder.folderPath);
                  }}
                  title="Reveal in Windows Explorer"
                >
                  <ExternalLink size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Right Click Context Menu */}
      {contextMenu.visible && contextMenu.folder && (
        <div
          className="fluent-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              onOpenFolder(contextMenu.folder.folderPath, contextMenu.folder.folderName, activeCategory);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <FolderOpen size={15} />
            <span>Open Folder</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              window.electronAPI?.revealInExplorer(contextMenu.folder.folderPath);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <ExternalLink size={15} />
            <span>Open in File Explorer</span>
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item"
            onClick={() => {
              handleCopy(false, [contextMenu.folder.folderPath]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Copy size={15} />
            <span>Copy (Ctrl+C)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              handleCopy(true, [contextMenu.folder.folderPath]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Scissors size={15} />
            <span>Cut (Ctrl+X)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              startRenameFolder(contextMenu.folder);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Edit2 size={15} />
            <span>Rename Folder (F2)</span>
          </button>

          <button
            className="context-menu-item"
            onClick={() => {
              toggleSelect(contextMenu.folder.folderPath);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <CheckSquare size={15} />
            <span>{selectedPaths.has(contextMenu.folder.folderPath) ? 'Deselect' : 'Select'}</span>
          </button>

          <div className="context-menu-divider" />

          <button
            className="context-menu-item danger"
            onClick={() => {
              confirmDeleteFolders([contextMenu.folder]);
              setContextMenu((p) => ({ ...p, visible: false }));
            }}
          >
            <Trash2 size={15} />
            <span>Delete to Recycle Bin</span>
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetFolders && (
        <div className="modal-backdrop" onClick={() => setDeleteTargetFolders(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={20} className="text-red" />
                <h3>Move Folder(s) to Recycle Bin?</h3>
              </div>
              <button className="modal-close-icon-btn" onClick={() => setDeleteTargetFolders(null)}>
                <X size={18} />
              </button>
            </div>

            <p className="modal-desc" style={{ marginTop: '10px' }}>
              Are you sure you want to delete the following {deleteTargetFolders.length} folder(s)? Files will be moved to the Windows Recycle Bin:
            </p>

            <div className="delete-folders-preview-list">
              {deleteTargetFolders.map((f) => (
                <div key={f.folderPath} className="delete-folder-row">
                  <Folder size={15} className="text-accent" />
                  <span className="del-name">{f.folderName}</span>
                  <span className="del-size">({formatBytes(f.totalSize)})</span>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="fluent-button" onClick={() => setDeleteTargetFolders(null)}>
                Cancel
              </button>
              <button className="fluent-button danger-btn" onClick={executeDeleteFolders}>
                <Trash2 size={15} />
                <span>Move to Recycle Bin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Folder Modal */}
      {renameTargetFolder && (
        <div className="modal-backdrop" onClick={() => setRenameTargetFolder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Edit2 size={18} className="text-accent" />
                <h3>Rename Folder</h3>
              </div>
              <button className="modal-close-icon-btn" onClick={() => setRenameTargetFolder(null)}>
                <X size={18} />
              </button>
            </div>

            <p className="modal-desc" style={{ marginTop: '10px' }}>
              Enter a new name for folder: <strong>{renameTargetFolder.folderName}</strong>
            </p>

            <div style={{ marginTop: '14px' }}>
              <input
                type="text"
                className="fluent-input"
                style={{ width: '100%' }}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeRenameFolder();
                  if (e.key === 'Escape') setRenameTargetFolder(null);
                }}
                autoFocus
              />
            </div>

            <div className="modal-actions" style={{ marginTop: '18px' }}>
              <button className="fluent-button" onClick={() => setRenameTargetFolder(null)}>
                Cancel
              </button>
              <button
                className="fluent-button primary"
                onClick={executeRenameFolder}
                disabled={!newFolderName.trim() || newFolderName.trim() === renameTargetFolder.folderName}
              >
                Rename Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
