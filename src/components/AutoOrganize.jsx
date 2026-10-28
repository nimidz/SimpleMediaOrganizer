import React, { useState } from 'react';
import { Wand2, FolderInput, FolderOutput, Play, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AutoOrganize() {
  const [sourceDir, setSourceDir] = useState('');
  const [namingPattern, setNamingPattern] = useState('Media_{YYYYMMDD}_{INDEX}');
  const [organizeMode, setOrganizeMode] = useState('year-month'); // 'year-month' | 'category' | 'flat'
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleSelectSource = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) setSourceDir(selected);
    }
  };

  const handleStartOrganize = async () => {
    if (!sourceDir) {
      alert('Please select a source folder first.');
      return;
    }
    setIsProcessing(true);
    setStatusMessage('Scanning files in folder...');

    try {
      const res = await window.electronAPI.readFolder(sourceDir);
      if (!res.success || res.items.length === 0) {
        setStatusMessage('No files found to organize in this folder.');
        setIsProcessing(false);
        return;
      }

      let renamedCount = 0;
      const files = res.items.filter((i) => !i.isDirectory);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const date = new Date(file.mtimeMs || Date.now());
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const indexStr = String(i + 1).padStart(3, '0');

        let newBaseName = namingPattern
          .replace('{YYYYMMDD}', `${yyyy}${mm}${dd}`)
          .replace('{YYYY}', `${yyyy}`)
          .replace('{MM}', `${mm}`)
          .replace('{INDEX}', indexStr);

        const newFileName = `${newBaseName}${file.extension}`;
        const newPath = `${sourceDir}\\${newFileName}`;

        if (file.path !== newPath) {
          await window.electronAPI.renameFile(file.path, newPath);
          renamedCount++;
        }
      }

      setStatusMessage(`Finished! Successfully organized and renamed ${renamedCount} file(s).`);
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    }
    setIsProcessing(false);
  };

  return (
    <div className="page-content auto-organize-page">
      <div className="section-block">
        <h2 className="section-title">
          <Wand2 size={20} className="text-accent" />
          Auto-Organize & Batch Rename
        </h2>
        <p className="section-desc">
          Automatically organize hundreds of media files using consistent naming patterns or group them into year/month folders.
        </p>
      </div>

      <div className="organize-form-card">
        {/* Source Directory Picker */}
        <div className="form-group">
          <label className="form-label">Source Media Folder</label>
          <div className="input-with-button">
            <input
              type="text"
              className="fluent-input flex-1"
              placeholder="Select a folder to organize..."
              value={sourceDir}
              readOnly
            />
            <button className="fluent-button" onClick={handleSelectSource}>
              <FolderInput size={16} />
              <span>Browse...</span>
            </button>
          </div>
        </div>

        {/* Naming Pattern */}
        <div className="form-group">
          <label className="form-label">Batch Rename Pattern</label>
          <input
            type="text"
            className="fluent-input"
            value={namingPattern}
            onChange={(e) => setNamingPattern(e.target.value)}
          />
          <span className="form-hint">
            Supported tags: <code>{'{YYYYMMDD}'}</code>, <code>{'{YYYY}'}</code>, <code>{'{MM}'}</code>, <code>{'{INDEX}'}</code>
          </span>
        </div>

        {/* Action Button */}
        <div className="form-action-row">
          <button
            className="fluent-button primary large"
            onClick={handleStartOrganize}
            disabled={isProcessing || !sourceDir}
          >
            <Play size={16} />
            <span>{isProcessing ? 'Processing...' : 'Start Organizing Files'}</span>
          </button>
        </div>

        {statusMessage && (
          <div className="status-banner">
            <CheckCircle2 size={18} className="text-accent" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
}
