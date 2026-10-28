import React, { useState } from 'react';
import { CopyCheck, FolderSearch, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function DuplicateFinder({ folders = [] }) {
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  // Group files by size and name similarity across all scanned folders
  const runDuplicateScan = () => {
    setIsScanning(true);
    const sizeMap = new Map();

    folders.forEach((f) => {
      if (f.latestItem) {
        const key = `${f.latestItem.size}_${f.latestItem.name.toLowerCase()}`;
        if (!sizeMap.has(key)) {
          sizeMap.set(key, []);
        }
        sizeMap.get(key).push(f.latestItem);
      }
    });

    const dupes = Array.from(sizeMap.values()).filter((group) => group.length > 1);
    setDuplicateGroups(dupes);
    setIsScanning(false);
    setHasScanned(true);
  };

  return (
    <div className="page-content duplicate-finder-page">
      <div className="section-block">
        <h2 className="section-title">
          <CopyCheck size={20} className="text-accent" />
          Duplicate Media Finder
        </h2>
        <p className="section-desc">
          Identify duplicate and identical files across your folders to recover precious storage space.
        </p>
      </div>

      <div className="duplicate-control-card">
        <button
          className="fluent-button primary"
          onClick={runDuplicateScan}
          disabled={isScanning || folders.length === 0}
        >
          <FolderSearch size={16} />
          <span>{isScanning ? 'Scanning Duplicates...' : 'Scan For Duplicates'}</span>
        </button>
        {folders.length === 0 && (
          <span className="warning-text">
            No media folders scanned yet. Open Dashboard or Review Media first.
          </span>
        )}
      </div>

      {hasScanned && duplicateGroups.length === 0 && (
        <div className="empty-state">
          <CopyCheck size={42} className="empty-icon text-accent" />
          <h3>No Duplicate Files Found</h3>
          <p>Your media library is clean and free of redundant duplicates.</p>
        </div>
      )}

      {duplicateGroups.length > 0 && (
        <div className="dupes-groups-list">
          {duplicateGroups.map((group, gIdx) => (
            <div key={gIdx} className="dupe-group-card">
              <div className="dupe-group-header">
                <AlertTriangle size={16} className="text-amber" />
                <span className="dupe-group-title">
                  {group.length} Identical Files ({formatBytes(group[0]?.size)})
                </span>
              </div>
              <div className="dupe-items-list">
                {group.map((item, iIdx) => (
                  <div key={item.path} className="dupe-item-row">
                    <span className="dupe-item-index">#{iIdx + 1}</span>
                    <span className="dupe-item-path" title={item.path}>
                      {item.path}
                    </span>
                    <button
                      className="fluent-button"
                      onClick={() => window.electronAPI?.revealInExplorer(item.path)}
                      title="Reveal in Windows Explorer"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
