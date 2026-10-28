import React, { useState, useEffect } from 'react';
import { Minus, Square, Copy, X, FolderTree } from 'lucide-react';

export default function TitleBar({ currentPath, isScanning, onCancelScan }) {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMax);
    }
  }, []);

  const handleMinimize = () => window.electronAPI?.minimizeWindow();
  const handleMaximize = () => {
    window.electronAPI?.maximizeWindow();
    setIsMax(!isMax);
  };
  const handleClose = () => window.electronAPI?.closeWindow();

  return (
    <div className="titlebar-container">
      {/* Drag Region */}
      <div className="titlebar-drag-region">
        <div className="titlebar-logo">
          <img src="/icons/32x32.png" alt="logo" className="titlebar-app-icon" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3 }} />
          <span className="titlebar-title">SimpleMediaOrganizer</span>
        </div>
        {currentPath && (
          <div className="titlebar-breadcrumb">
            <span className="titlebar-path">{currentPath}</span>
          </div>
        )}
        {isScanning && (
          <div className="titlebar-scanning-badge">
            <div className="spinner-mini"></div>
            <span>Scanning...</span>
            <button className="titlebar-cancel-btn" onClick={onCancelScan} title="Cancel scanning">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Window Controls */}
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={handleMinimize} title="Minimize">
          <Minus size={14} />
        </button>
        <button className="titlebar-btn" onClick={handleMaximize} title={isMax ? 'Restore' : 'Maximize'}>
          {isMax ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button className="titlebar-btn close" onClick={handleClose} title="Close to Tray">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
