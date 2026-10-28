import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Folder,
  FolderOpen,
  ArrowUp,
  File,
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  ExternalLink,
  Trash2,
  Copy,
  Scissors,
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';

export default function WatchedMedia({
  drives,
  onOpenFolderInReview,
  onOpenLightbox,
  onPlayAudio,
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState('');

  useEffect(() => {
    if (drives.length > 0 && !currentPath) {
      navigateTo(drives[0].path);
    }
  }, [drives]);

  const navigateTo = async (targetPath) => {
    setLoading(true);
    if (window.electronAPI) {
      const res = await window.electronAPI.readFolder(targetPath);
      if (res.success) {
        setCurrentPath(targetPath);
        setItems(res.items);
      }
    }
    setLoading(false);
  };

  const goUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('\\').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const parent = parts.join('\\') + (parts.length === 1 ? '\\' : '');
      navigateTo(parent);
    }
  };

  const handleCopyClipboard = async (item, isCut = false) => {
    if (window.electronAPI) {
      await window.electronAPI.copyFilesToClipboard([item.path], isCut);
      setClipboardStatus(isCut ? `Cut ${item.name} to Windows Clipboard` : `Copied ${item.name} to Windows Clipboard`);
      setTimeout(() => setClipboardStatus(''), 2500);
    }
  };

  const getItemIcon = (item) => {
    if (item.isDirectory) return <Folder size={18} className="text-accent" />;
    if (item.category === 'image') return <ImageIcon size={18} className="text-purple" />;
    if (item.category === 'video') return <Film size={18} className="text-red" />;
    if (item.category === 'audio') return <Music size={18} className="text-cyan" />;
    if (item.category === 'document') return <FileText size={18} className="text-blue" />;
    return <File size={18} className="text-muted" />;
  };

  return (
    <div className="page-content watched-media-page">
      {/* Explorer Navigation Bar */}
      <div className="explorer-toolbar">
        <div className="explorer-nav-buttons">
          <button
            className="fluent-button"
            onClick={goUp}
            disabled={!currentPath || currentPath.endsWith(':\\')}
            title="Up one level (Parent Folder)"
          >
            <ArrowUp size={16} />
            <span>Up</span>
          </button>
        </div>

        {/* Drive Quick Switcher */}
        <div className="drives-quick-pills">
          {drives.map((d) => (
            <button
              key={d.path}
              className={`drive-pill ${currentPath.startsWith(d.path) ? 'active' : ''}`}
              onClick={() => navigateTo(d.path)}
            >
              <HardDrive size={14} />
              <span>{d.name.split(' ')[0]} ({d.path})</span>
            </button>
          ))}
        </div>

        {/* Current Path Bar */}
        <div className="explorer-path-input-wrap">
          <input
            type="text"
            className="fluent-input explorer-path-input"
            value={currentPath}
            readOnly
          />
        </div>

        <button
          className="fluent-button"
          onClick={() => window.electronAPI?.revealInExplorer(currentPath)}
          title="Open in Windows Explorer"
        >
          <ExternalLink size={15} />
          <span>Explorer</span>
        </button>
      </div>

      {clipboardStatus && (
        <div className="status-toast-bar">
          <span>{clipboardStatus}</span>
        </div>
      )}

      {/* Explorer File List Table */}
      <div className="explorer-table-container">
        <div className="explorer-table-header">
          <div className="col-icon"></div>
          <div className="col-name">Name</div>
          <div className="col-type">Type</div>
          <div className="col-date">Date Modified</div>
          <div className="col-size">Size</div>
          <div className="col-act">Actions</div>
        </div>

        {loading ? (
          <div className="viewer-loading">
            <div className="spinner-mini"></div>
            <p>Reading folder...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <FolderOpen size={42} className="empty-icon" />
            <p>This folder is empty</p>
          </div>
        ) : (
          <div className="explorer-table-body">
            {items.map((item) => (
              <div
                key={item.path}
                className="explorer-row"
                draggable="true"
                onDragStart={(e) => {
                  e.preventDefault();
                  window.electronAPI?.startDrag([item.path]);
                }}
                onDoubleClick={() => {
                  if (item.isDirectory) {
                    navigateTo(item.path);
                  } else if (item.category === 'image' || item.category === 'video') {
                    onOpenLightbox(item, items.filter((i) => !i.isDirectory));
                  } else if (item.category === 'audio') {
                    onPlayAudio(item);
                  } else {
                    window.electronAPI?.openPath(item.path);
                  }
                }}
              >
                <div className="col-icon">{getItemIcon(item)}</div>
                <div className="col-name" title={item.name}>
                  {item.name}
                </div>
                <div className="col-type">
                  {item.isDirectory ? 'File Folder' : item.extension ? `${item.extension.toUpperCase()} File` : 'File'}
                </div>
                <div className="col-date">{formatDate(item.mtimeMs)}</div>
                <div className="col-size">{item.isDirectory ? '-' : formatBytes(item.size)}</div>
                <div className="col-act actions-cell">
                  <button
                    className="row-btn"
                    onClick={() => handleCopyClipboard(item, false)}
                    title="Copy to Windows Clipboard"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="row-btn"
                    onClick={() => handleCopyClipboard(item, true)}
                    title="Cut to Windows Clipboard"
                  >
                    <Scissors size={13} />
                  </button>
                  <button
                    className="row-btn"
                    onClick={() => window.electronAPI?.revealInExplorer(item.path)}
                    title="Reveal in Windows Explorer"
                  >
                    <ExternalLink size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
