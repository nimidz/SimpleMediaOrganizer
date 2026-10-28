import React, { useState, useEffect } from 'react';
import {
  FilterX,
  FolderInput,
  Plus,
  Save,
  Trash2,
  Edit2,
  CheckCircle2,
  X,
  Info,
  Globe,
  Folder,
} from 'lucide-react';

export default function IgnorePatterns() {
  const [folderPath, setFolderPath] = useState('Global');
  const [isGlobal, setIsGlobal] = useState(true);
  const [patterns, setPatterns] = useState([]);
  const [newPatternInput, setNewPatternInput] = useState('');
  const [rules, setRules] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Load saved rules from storage
  const loadRules = async () => {
    if (window.electronAPI?.getIgnoreRules) {
      const saved = await window.electronAPI.getIgnoreRules();
      if (Array.isArray(saved)) {
        setRules(saved);
        return;
      }
    }
    setRules([]);
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSelectFolder = async () => {
    if (window.electronAPI?.selectDirectory) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        setFolderPath(selected);
        setIsGlobal(false);
      }
    }
  };

  const handleSetGlobal = () => {
    setIsGlobal(true);
    setFolderPath('Global');
  };

  const handleAddPattern = () => {
    const trimmed = newPatternInput.trim();
    if (!trimmed) return;
    if (!patterns.includes(trimmed)) {
      setPatterns([...patterns, trimmed]);
    }
    setNewPatternInput('');
  };

  const handleRemovePattern = (patternToRemove) => {
    setPatterns(patterns.filter((p) => p !== patternToRemove));
  };

  const handleSaveRule = async () => {
    if (!folderPath) {
      alert('Please select a folder or choose Global.');
      return;
    }
    if (patterns.length === 0) {
      alert('Please add at least one pattern to ignore.');
      return;
    }

    let updatedRules = [...rules];
    const targetFolder = isGlobal ? 'Global' : folderPath;

    if (editingRuleId) {
      updatedRules = updatedRules.map((r) =>
        r.id === editingRuleId
          ? {
              ...r,
              folder: targetFolder,
              patterns: [...patterns],
            }
          : r
      );
      setEditingRuleId(null);
      setStatusMessage('Ignore rule updated successfully.');
    } else {
      const newRule = {
        id: 'rule_' + Date.now(),
        folder: targetFolder,
        enabled: true,
        patterns: [...patterns],
      };
      updatedRules.push(newRule);
      setStatusMessage('New ignore rule saved successfully.');
    }

    setRules(updatedRules);
    if (window.electronAPI?.saveIgnoreRules) {
      await window.electronAPI.saveIgnoreRules(updatedRules);
    }

    // Reset form to clean empty defaults
    setFolderPath('Global');
    setIsGlobal(true);
    setPatterns([]);
    setTimeout(() => setStatusMessage(''), 4000);
  };

  const handleEditRule = (rule) => {
    setEditingRuleId(rule.id);
    if (rule.folder === 'Global' || !rule.folder) {
      setIsGlobal(true);
      setFolderPath('Global');
    } else {
      setIsGlobal(false);
      setFolderPath(rule.folder);
    }
    setPatterns(Array.isArray(rule.patterns) ? [...rule.patterns] : []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setFolderPath('Global');
    setIsGlobal(true);
    setPatterns([]);
  };

  const handleDeleteRule = async (ruleId) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    setRules(updated);
    if (window.electronAPI?.saveIgnoreRules) {
      await window.electronAPI.saveIgnoreRules(updated);
    }
    if (editingRuleId === ruleId) {
      handleCancelEdit();
    }
    setStatusMessage('Rule deleted.');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleToggleRule = async (ruleId) => {
    const updated = rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    setRules(updated);
    if (window.electronAPI?.saveIgnoreRules) {
      await window.electronAPI.saveIgnoreRules(updated);
    }
  };

  return (
    <div className="page-content ignore-patterns-page">
      {/* Top Banner Header */}
      <div className="ignore-hero-banner">
        <div className="hero-title-row">
          <FilterX size={24} className="text-sky" />
          <h1 className="hero-heading">Ignore Analysis Rules</h1>
        </div>
        <p className="hero-subheading">
          Configure folders and file patterns that the analysis engine will completely skip during fast scanning.
        </p>
      </div>

      {/* Main Configuration Card */}
      <div className="ignore-config-card">
        <div className="config-card-header">
          <h2 className="config-card-title">
            {editingRuleId ? 'Edit Ignore Rule' : 'New Ignore Rule'}
          </h2>
          <span className="config-card-desc">
            Define specific folders and wildcard patterns to exclude from analysis.
          </span>
        </div>

        {/* Folder Selection Option */}
        <div className="ignore-form-section">
          <label className="section-field-label">Select Folder Scope</label>
          <div className="folder-scope-toggle-row">
            <button
              className={`fluent-button scope-btn ${isGlobal ? 'active' : ''}`}
              onClick={handleSetGlobal}
              type="button"
            >
              <Globe size={15} />
              <span>Global (All Drives & Folders)</span>
            </button>
            <button
              className={`fluent-button scope-btn ${!isGlobal ? 'active' : ''}`}
              onClick={handleSelectFolder}
              type="button"
            >
              <Folder size={15} />
              <span>Specific Folder</span>
            </button>
          </div>

          <div className="folder-input-row">
            <input
              type="text"
              className="fluent-input folder-path-display"
              value={folderPath}
              readOnly={isGlobal}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="Select folder or leave as Global"
            />
            {!isGlobal && (
              <button className="fluent-button" onClick={handleSelectFolder} type="button">
                <FolderInput size={16} />
                <span>Browse...</span>
              </button>
            )}
          </div>
          <span className="field-hint-text">
            Within this folder, the application will not analyze matching files/directories:
          </span>
        </div>

        {/* Patterns Management */}
        <div className="ignore-form-section">
          <label className="section-field-label">Patterns</label>

          {/* Active Badges List */}
          <div className="patterns-badges-container">
            {patterns.length === 0 ? (
              <span className="empty-patterns-hint">
                No patterns added yet. Enter a pattern below (e.g. <code>*.tmp</code> or <code>node_modules/</code>) and click Add.
              </span>
            ) : (
              patterns.map((p) => (
                <div key={p} className="pattern-pill-tag">
                  <span className="pattern-pill-text">{p}</span>
                  <button
                    type="button"
                    className="pattern-pill-remove-btn"
                    onClick={() => handleRemovePattern(p)}
                    title={`Remove ${p}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add Pattern Input Box */}
          <div className="pattern-input-bar">
            <input
              type="text"
              className="fluent-input pattern-text-input"
              value={newPatternInput}
              onChange={(e) => setNewPatternInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddPattern();
                }
              }}
              placeholder="e.g. *.tmp or node_modules/"
            />
            <button
              type="button"
              className="fluent-button pattern-add-btn"
              onClick={handleAddPattern}
              disabled={!newPatternInput.trim()}
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>

          {/* Tips Box */}
          <div className="pattern-tips-card">
            <div className="pattern-tips-header">
              <Info size={15} className="text-sky" />
              <span className="pattern-tips-title">Tips:</span>
            </div>
            <ul className="pattern-tips-list">
              <li><code>*.tmp</code> &mdash; ignore all .tmp files</li>
              <li><code>node_modules/</code> &mdash; ignore the folder and its subdirectories</li>
              <li><code>~$*</code> &mdash; ignore Office temporary lock files</li>
              <li><code>.DS_Store</code> &mdash; ignore exact file name</li>
              <li><code>thumbs.db</code> &mdash; ignore Windows thumbnail cache files</li>
              <li><code>*.bak</code> &mdash; ignore backup files</li>
              <li><code>.git/</code> &mdash; ignore Git version control metadata</li>
              <li><code>build/</code> &mdash; ignore build output folders</li>
              <li><code>*.log</code> &mdash; ignore log text files</li>
            </ul>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="form-action-row ignore-card-actions">
          <button
            className="fluent-button primary large save-rule-btn"
            onClick={handleSaveRule}
            type="button"
          >
            <Save size={16} />
            <span>{editingRuleId ? 'Update Rule' : 'Save Rule'}</span>
          </button>

          {editingRuleId && (
            <button
              className="fluent-button large secondary"
              onClick={handleCancelEdit}
              type="button"
            >
              Cancel Edit
            </button>
          )}
        </div>

        {statusMessage && (
          <div className="status-banner" style={{ marginTop: '16px' }}>
            <CheckCircle2 size={18} className="text-sky" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Manage Ignore Rules Section */}
      <div className="ignore-manage-section">
        <div className="manage-section-header">
          <h3 className="manage-section-title">Manage Ignore Rules</h3>
          <span className="manage-section-subtitle">
            Active rules applied during background analysis and scanning.
          </span>
        </div>

        <div className="rules-cards-list">
          {rules.length === 0 ? (
            <div className="empty-rules-card">
              <FilterX size={36} className="empty-rules-icon" />
              <div className="empty-rules-title">No Ignore Rules Configured</div>
              <p className="empty-rules-desc">
                Add your first rule above to exclude specific folders, temp files, or build artifacts from scanning.
              </p>
            </div>
          ) : (
            rules.map((rule) => (
              <div
                key={rule.id}
                className={`task-card ${rule.enabled ? '' : 'disabled'}`}
              >
                <div className="task-info-col">
                  <div className="task-header-line">
                    <span className="task-path">
                      {rule.folder === 'Global' ? 'Global Scope (All Drives)' : rule.folder}
                    </span>
                    <span
                      className={`task-status-badge ${
                        rule.enabled ? 'active' : 'paused'
                      }`}
                    >
                      {rule.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  <div className="task-details-line" style={{ flexWrap: 'wrap', gap: '6px' }}>
                    {Array.isArray(rule.patterns) && rule.patterns.length > 0 ? (
                      rule.patterns.map((pt) => (
                        <span key={pt} className="rule-pattern-tag">
                          <code>{pt}</code>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted" style={{ fontSize: '11px' }}>(No patterns)</span>
                    )}
                  </div>
                </div>

                <div className="task-actions-col">
                  {/* Enable / Disable Switch */}
                  <div
                    className={`fluent-switch ${rule.enabled ? 'checked' : ''}`}
                    onClick={() => handleToggleRule(rule.id)}
                    title={rule.enabled ? 'Disable Rule' : 'Enable Rule'}
                    role="switch"
                    aria-checked={rule.enabled}
                  >
                    <div className="fluent-switch-thumb" />
                  </div>

                  {/* Edit Button */}
                  <button
                    className="fluent-button"
                    onClick={() => handleEditRule(rule)}
                    title="Edit Rule"
                    type="button"
                  >
                    <Edit2 size={15} />
                  </button>

                  {/* Delete Button */}
                  <button
                    className="fluent-button danger-btn"
                    onClick={() => handleDeleteRule(rule.id)}
                    title="Delete Rule"
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
