import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  RefreshCcw,
  Trash2,
  Power,
  Check,
  ExternalLink,
  Scale,
} from 'lucide-react';
import appLogo from '../assets/app-icon.png';

export default function Settings({
  theme,
  setTheme,
  onRescanDrives,
  categories,
  onDeleteCustomCategory,
}) {
  const customList = Object.entries(categories).filter(([_, c]) => c.isCustom);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      if (window.electronAPI?.getAutostart) {
        window.electronAPI
          .getAutostart()
          .then((status) => {
            setAutostart(Boolean(status));
          })
          .catch(() => {});
      }
    };

    checkStatus();
    window.addEventListener('focus', checkStatus);
    return () => window.removeEventListener('focus', checkStatus);
  }, []);

  const handleToggleAutostart = async () => {
    if (!window.electronAPI?.setAutostart) return;
    setAutostartLoading(true);
    try {
      const next = !autostart;
      await window.electronAPI.setAutostart(next);
      setAutostart(next);
    } catch (err) {
      console.error('Failed to set autostart:', err);
    } finally {
      setAutostartLoading(false);
    }
  };

  const handleOpenUrl = (url) => {
    if (window.electronAPI?.openPath) {
      window.electronAPI.openPath(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="page-content settings-page">
      <div className="section-block">
        <h2 className="section-title">
          <SettingsIcon size={20} className="text-accent" />
          Settings & Preferences
        </h2>
        <p className="section-desc">Customize interface theme, storage options, and media categories.</p>
      </div>

      <div className="settings-cards-list">
        {/* Run on Windows Startup Settings */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="settings-title-with-badge">
              <h3>Run on Windows Startup</h3>
              <div className="startup-status-pill">
                <span className="status-label-text">Status :</span>
                <span className={`status-state-badge ${autostart ? 'active' : 'inactive'}`}>
                  <span className="status-indicator-dot"></span>
                  {autostart ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>
            <p>
              Automatically start SimpleMediaOrganizer when Windows boots. Runs quietly in the system tray so scheduled Auto-Organizer tasks keep running in the background.
            </p>
          </div>
          <div className="theme-toggle-row">
            <button
              className={`fluent-button ${autostart ? 'primary' : ''}`}
              onClick={handleToggleAutostart}
              disabled={autostartLoading}
            >
              <Power size={16} />
              <span>{autostart ? 'Enabled (Starts with Windows)' : 'Disabled (Manual Start Only)'}</span>
              {autostart && <Check size={14} />}
            </button>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3>Appearance Theme</h3>
            <p>Select your preferred Windows 11 Fluent color theme.</p>
          </div>
          <div className="theme-toggle-row">
            <button
              className={`fluent-button theme-opt-btn ${theme === 'dark' ? 'primary' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon size={16} />
              <span>Dark Mode</span>
            </button>
            <button
              className={`fluent-button theme-opt-btn ${theme === 'light' ? 'primary' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun size={16} />
              <span>Light Mode</span>
            </button>
          </div>
        </div>

        {/* Drives & Cache Settings */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3>Drives & Storage Refresh</h3>
            <p>Refresh the list of connected local and external drives.</p>
          </div>
          <div className="theme-toggle-row">
            <button className="fluent-button" onClick={onRescanDrives}>
              <RefreshCcw size={16} />
              <span>Refresh PC Drives</span>
            </button>
          </div>
        </div>

        {/* Custom Categories Manager */}
        {customList.length > 0 && (
          <div className="settings-card">
            <div className="settings-card-header">
              <h3>Custom Media Categories</h3>
              <p>Manage the custom categories you have created.</p>
            </div>
            <div className="custom-cats-settings-list">
              {customList.map(([id, cat]) => (
                <div key={id} className="custom-cat-row">
                  <div className="custom-cat-info">
                    <span className="custom-cat-color-dot" style={{ backgroundColor: cat.color }} />
                    <span className="custom-cat-name">{cat.label}</span>
                    <span className="custom-cat-exts">({cat.extensions.join(', ')})</span>
                  </div>
                  <button
                    className="fluent-button danger-btn"
                    onClick={() => onDeleteCustomCategory(id)}
                    title="Delete Category"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* About App Card */}
        <div className="settings-card about-card-container">
          <div className="about-brand-row">
            <div className="about-logo-box">
              <img src={appLogo} alt="SimpleMediaOrganizer Logo" className="about-app-logo" />
            </div>
            <div className="about-brand-info">
              <div className="about-title-row">
                <h3 className="about-app-title">SimpleMediaOrganizer</h3>
                <span className="about-version-badge">v1.0.0</span>
              </div>
              <p className="about-description">
                SimpleMediaOrganizer is a modern, high-performance media organizer and file manager for Windows. Designed to organize thousands of photos, videos, audio files, and documents instantly, quickly, and smoothly.
              </p>
            </div>
          </div>

          {/* Primary Action Buttons: License & GitHub Profile */}
          <div className="about-actions-row">
            <button
              className="about-btn about-license-btn"
              onClick={() => handleOpenUrl('https://github.com/nimidz/SimpleMediaOrganizer/blob/main/LICENSE')}
              title="GNU Affero General Public License v3.0"
            >
              <Scale size={15} className="btn-icon-white" />
              <span>GNU AGPLv3.0</span>
              <ExternalLink size={12} className="btn-icon-white opacity-70" />
            </button>

            <button
              className="about-btn about-github-btn"
              onClick={() => handleOpenUrl('https://github.com/nimidz')}
              title="Visit Developer GitHub Profile"
            >
              <svg className="about-svg-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub Profile</span>
              <ExternalLink size={12} className="btn-icon-white opacity-70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
