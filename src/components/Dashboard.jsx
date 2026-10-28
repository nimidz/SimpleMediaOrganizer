import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Music,
  Film,
  FileText,
  Archive,
  Layers,
  Palette,
  Code,
  BookOpen,
  HardDrive,
  FolderSearch,
  Zap,
  Plus,
  ArrowRight,
  FolderPlus,
  Files,
  MoreVertical,
  X,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function Dashboard({
  summary,
  drives,
  activeScanPath,
  categories,
  onStartScan,
  onSelectDrive,
  onSelectCategory,
  onSelectCustomFolder,
  onAddCustomCategory,
  onUpdateCategory,
  onDeleteCategory,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatFolderName, setNewCatFolderName] = useState('');
  const [newCatExts, setNewCatExts] = useState('');
  const [newCatColor, setNewCatColor] = useState('#ec4899');
  const [folderNameEdited, setFolderNameEdited] = useState(false);

  // Edit category modal state
  const [editingCat, setEditingCat] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFolderName, setEditFolderName] = useState('');
  const [editExts, setEditExts] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');

  const getCategoryIcon = (id) => {
    switch (id) {
      case 'image':
        return ImageIcon;
      case 'video':
        return Film;
      case 'audio':
        return Music;
      case 'document':
        return FileText;
      case 'creative':
        return Palette;
      case 'code':
        return Code;
      case 'ebook':
        return BookOpen;
      case 'archive':
        return Archive;
      case 'app':
        return Layers;
      case 'other':
        return Files;
      default:
        return FolderPlus;
    }
  };

  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCatName.trim() || !newCatExts.trim()) return;

    const id = newCatName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const exts = newCatExts
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean)
      .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));

    const customCategory = {
      id,
      label: newCatName.trim(),
      folderName: newCatFolderName.trim() || newCatName.trim().replace(/\s+/g, '_'),
      extensions: exts,
      color: newCatColor,
      isCustom: true,
    };

    onAddCustomCategory(customCategory);
    setShowAddModal(false);
    setNewCatName('');
    setNewCatFolderName('');
    setNewCatExts('');
    setFolderNameEdited(false);
  };

  const openAddCategory = () => {
    setNewCatName('');
    setNewCatFolderName('');
    setNewCatExts('');
    setNewCatColor('#ec4899');
    setFolderNameEdited(false);
    setShowAddModal(true);
  };

  const openEditCategory = (catId, cat) => {
    setEditingCat({ id: catId, ...cat });
    setEditName(cat.label || catId);
    setEditFolderName(cat.folderName || catId);
    setEditExts(Array.isArray(cat.extensions) ? cat.extensions.join(', ') : '');
    setEditColor(cat.color || '#3b82f6');
  };

  const handleSaveEditCategory = (e) => {
    e.preventDefault();
    if (!editingCat || !editName.trim()) return;
    if (editingCat.id !== 'other' && !editExts.trim()) return;

    const exts = editExts
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean)
      .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));

    const updated = {
      ...editingCat,
      label: editName.trim(),
      folderName: editFolderName.trim() || editName.trim().replace(/\s+/g, '_'),
      extensions: editingCat.id === 'other' ? ['.Unassigned (Extension)'] : exts,
      color: editColor,
    };

    onUpdateCategory?.(editingCat.id, updated);
    setEditingCat(null);
  };

  const handleDeleteOrResetCategory = () => {
    if (!editingCat) return;
    const isCustom = editingCat.isCustom;
    const confirmMsg = isCustom
      ? `Delete custom category "${editingCat.label}"?`
      : `Reset category "${editingCat.label}" to default extensions and settings?`;

    if (window.confirm(confirmMsg)) {
      onDeleteCategory?.(editingCat.id);
      setEditingCat(null);
    }
  };

  return (
    <div className="page-content dashboard-page">
      {/* Welcome & Fast Scan Banner */}
      <div className="dashboard-hero-card">
        <div className="hero-text">
          <h2>Storage & Media Overview</h2>
          <p className="hero-desc">
            Ultra-fast non-blocking media scanner performing traversal at Everything Search speed.
            {activeScanPath ? (
              <span className="hero-target"> Active source: <strong>{activeScanPath}</strong></span>
            ) : (
              ' Select a drive or custom folder to scan.'
            )}
          </p>
        </div>
        <div className="hero-actions">
          <button className="fluent-button primary" onClick={onSelectCustomFolder}>
            <FolderSearch size={16} />
            Scan Custom Folder
          </button>
        </div>
      </div>

      {/* Drive Status Cards */}
      <div className="section-block">
        <h3 className="section-title">
          <HardDrive size={18} />
          Available Local Drives
        </h3>
        <div className="drives-grid">
          {drives.map((d) => {
            const used = d.size && d.free ? d.size - d.free : 0;
            const percent = d.size ? Math.round((used / d.size) * 100) : 0;
            const isScanningThis = activeScanPath === d.path;

            return (
              <div
                key={d.path}
                className={`drive-card ${isScanningThis ? 'active-scan' : ''}`}
                onClick={() => onSelectDrive(d.path)}
              >
                <div className="drive-header">
                  <div className="drive-icon-wrap">
                    <HardDrive size={22} className="text-accent" />
                  </div>
                  <div className="drive-info">
                    <div className="drive-name">{d.name}</div>
                    <div className="drive-capacity">
                      {d.size ? `${formatBytes(d.free)} free of ${formatBytes(d.size)}` : d.path}
                    </div>
                  </div>
                </div>
                {d.size > 0 && (
                  <div className="drive-meter-track">
                    <div
                      className={`drive-meter-fill ${percent > 90 ? 'danger' : ''}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
                <div className="drive-footer">
                  <span className="drive-scan-label">
                    {isScanningThis ? 'Currently Scanned' : 'Click to Scan Media'}
                  </span>
                  <ArrowRight size={14} className="drive-arrow" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Aggregated Media Categories Section */}
      <div className="section-block">
        <div className="section-header-row">
          <div className="section-title-wrap">
            <h3 className="section-title">
              <Layers size={18} />
              Aggregated Media Categories
            </h3>
            <span className="section-subtitle">
              Browse media by content categories across your entire drive or scanned directory
            </span>
          </div>
          <div className="section-header-actions">
            {summary?.durationMs > 0 && (
              <span className="scan-speed-badge">
                <Zap size={14} /> Scanned in {(summary.durationMs / 1000).toFixed(2)}s
              </span>
            )}
            <button className="fluent-button" onClick={openAddCategory}>
              <Plus size={16} />
              Add Custom Category
            </button>
          </div>
        </div>

        <div className="category-cards-grid">
          {Object.entries(categories).map(([catId, cat]) => {
            const Icon = getCategoryIcon(catId);
            const count = summary?.[catId]?.count || 0;
            const size = summary?.[catId]?.size || 0;

            return (
              <div
                key={catId}
                className="category-card"
                onClick={() => onSelectCategory(catId)}
              >
                {/* 3-dots Menu Button */}
                <button
                  type="button"
                  className="category-dots-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditCategory(catId, cat);
                  }}
                  title={`Edit Category: ${cat.label}`}
                >
                  <MoreVertical size={16} />
                </button>

                <div
                  className="category-icon-box"
                  style={{
                    backgroundColor: `${cat.color}20`,
                    color: cat.color,
                  }}
                >
                  <Icon size={30} />
                </div>
                <div className="category-label">{cat.label}</div>
                <div className="category-stats">
                  {formatBytes(size)} ({count.toLocaleString()})
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Custom Category Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-content category-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>Add Custom Media Category</h3>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setShowAddModal(false)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-desc">
              Create a custom category to automatically track and organize specific file extensions.
            </p>
            <form onSubmit={handleCreateCategory} className="custom-cat-form">
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input
                  type="text"
                  name="catName"
                  className="fluent-input"
                  placeholder="e.g. 3D Models, Torrents, Projects"
                  value={newCatName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCatName(val);
                    if (!folderNameEdited) {
                      setNewCatFolderName(val.replace(/\s+/g, '_'));
                    }
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Auto-Organize Target Folder Name</label>
                <input
                  type="text"
                  name="catFolderName"
                  className="fluent-input"
                  placeholder="e.g. 3D_Models"
                  value={newCatFolderName}
                  onChange={(e) => {
                    setFolderNameEdited(true);
                    setNewCatFolderName(e.target.value);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Extensions (comma separated)</label>
                <textarea
                  name="catExts"
                  className="fluent-input fluent-textarea"
                  rows={2}
                  placeholder="e.g. .obj, .fbx, .stl, .blend"
                  value={newCatExts}
                  onChange={(e) => setNewCatExts(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="form-hint">Example: .obj, .fbx, .stl or obj, fbx</span>
              </div>

              <div className="form-group">
                <label className="form-label">Accent Color</label>
                <div className="color-presets-row">
                  {['#ec4899', '#f97316', '#14b8a6', '#6366f1', '#eab308', '#06b6d4', '#10b981', '#3b82f6', '#a855f7', '#ef4444'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-preset-circle ${newCatColor === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewCatColor(c)}
                    />
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="fluent-button"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="fluent-button primary">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCat && (
        <div className="modal-backdrop" onClick={() => setEditingCat(null)}>
          <div className="modal-content category-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <h3>Edit Category: {editingCat.label}</h3>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={() => setEditingCat(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="modal-desc">
              Edit name, destination folder, or file extensions for this category. Specified extensions are automatically prioritized for this category.
            </p>
            <form onSubmit={handleSaveEditCategory} className="custom-cat-form">
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input
                  type="text"
                  name="editCategoryName"
                  className="fluent-input"
                  placeholder="e.g. ISO Disk Images"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Auto-Organize Target Folder Name</label>
                <input
                  type="text"
                  name="editTargetFolder"
                  className="fluent-input"
                  placeholder="e.g. ISO_Images"
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Extensions (comma separated)</label>
                <textarea
                  name="editExtensions"
                  className="fluent-input fluent-textarea"
                  rows={2}
                  placeholder="e.g. .iso, .img, .bin"
                  value={editingCat?.id === 'other' ? '.Unassigned (Extension)' : editExts}
                  onChange={(e) => setEditExts(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={editingCat?.id === 'other'}
                  required
                />
                <span className="form-hint">
                  {editingCat?.id === 'other'
                    ? 'Universal category: automatically encompasses all extensions not defined in any other category.'
                    : 'Example: .iso, .img, .bin (automatically normalized)'}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Accent Color</label>
                <div className="color-presets-row">
                  {['#ec4899', '#f97316', '#14b8a6', '#6366f1', '#eab308', '#06b6d4', '#10b981', '#3b82f6', '#a855f7', '#ef4444'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-preset-circle ${editColor === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditColor(c)}
                    />
                  ))}
                </div>
              </div>

              <div className="modal-actions-between">
                <button
                  type="button"
                  className="fluent-button btn-danger-text"
                  onClick={handleDeleteOrResetCategory}
                  title={editingCat.isCustom ? 'Delete custom category' : 'Reset to default settings'}
                >
                  {editingCat.isCustom ? (
                    <>
                      <Trash2 size={15} />
                      <span>Delete Category</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw size={15} />
                      <span>Reset to Default</span>
                    </>
                  )}
                </button>

                <div className="modal-actions-right">
                  <button
                    type="button"
                    className="fluent-button"
                    onClick={() => setEditingCat(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="fluent-button primary">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
