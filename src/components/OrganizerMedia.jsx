import React, { useState, useEffect } from 'react';
import {
  FolderSync,
  FolderInput,
  Play,
  Clock,
  Save,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Settings2,
  RefreshCw,
} from 'lucide-react';
import { formatDate } from '../utils/formatters';

export default function OrganizerMedia({ categories }) {
  const [sourceFolder, setSourceFolder] = useState('');
  const [moveNewerOnly, setMoveNewerOnly] = useState(false);
  const [scheduleType, setScheduleType] = useState('tray'); // 'tray' | '30m' | '1h' | '6h' | '24h'
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Saved tasks list
  const [tasks, setTasks] = useState([]);
  const [editingTaskId, setEditingTaskId] = useState(null);

  // Load saved organizer tasks on mount
  const loadTasks = async () => {
    if (window.electronAPI) {
      const saved = await window.electronAPI.getOrganizerTasks();
      if (Array.isArray(saved)) setTasks(saved);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleSelectFolder = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) setSourceFolder(selected);
    }
  };

  // Run organization immediately on the current selected folder
  const handleOrganizeNow = async () => {
    if (!sourceFolder) {
      setStatusMessage('Warning: Please select a folder to organize first.');
      alert('Please select a folder to organize first.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage('Organizing media files into category subfolders...');

    try {
      const tempTask = {
        id: 'adhoc_' + Date.now(),
        sourceFolder,
        moveNewerOnly,
        scheduleType: 'tray',
        enabled: true,
      };

      const res = await window.electronAPI?.runOrganizerTask(tempTask, categories);
      if (res?.success) {
        setStatusMessage(
          `Success! Moved ${res.movedCount} media file(s) into their respective category folders.`
        );
      } else {
        setStatusMessage(`Error: ${res?.error || 'Unknown error occurred during organization'}`);
      }
    } catch (err) {
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      setStatusMessage(`Error: ${errMsg}`);
    }

    setIsProcessing(false);
  };

  // Save new or updated auto-organizer task
  const handleSaveTask = async () => {
    if (!sourceFolder) {
      setStatusMessage('Warning: Please select a folder to save first.');
      alert('Please select a folder to save first.');
      return;
    }

    let updatedTasks = [...tasks];

    if (editingTaskId) {
      updatedTasks = updatedTasks.map((t) =>
        t.id === editingTaskId
          ? {
              ...t,
              sourceFolder,
              moveNewerOnly,
              scheduleType,
            }
          : t
      );
      setEditingTaskId(null);
    } else {
      const newTask = {
        id: 'task_' + Date.now(),
        sourceFolder,
        moveNewerOnly,
        scheduleType,
        enabled: true,
        createdAt: Date.now(),
        lastRun: null,
      };
      updatedTasks.push(newTask);
    }

    setTasks(updatedTasks);
    await window.electronAPI?.saveOrganizerTasks(updatedTasks);
    setStatusMessage('Auto-Organizer task saved! Running in the background and system tray.');
    setSourceFolder('');
  };

  const handleEditTask = (task) => {
    setEditingTaskId(task.id);
    setSourceFolder(task.sourceFolder);
    setMoveNewerOnly(task.moveNewerOnly);
    setScheduleType(task.scheduleType);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTask = async (taskId) => {
    if (window.confirm('Delete this Auto-Organizer task?')) {
      const next = tasks.filter((t) => t.id !== taskId);
      setTasks(next);
      await window.electronAPI?.saveOrganizerTasks(next);
    }
  };

  const handleToggleTask = async (taskId) => {
    const next = tasks.map((t) => (t.id === taskId ? { ...t, enabled: !t.enabled } : t));
    setTasks(next);
    await window.electronAPI?.saveOrganizerTasks(next);
  };

  const handleRunSavedTaskNow = async (task) => {
    setIsProcessing(true);
    setStatusMessage(`Running task for: ${task.sourceFolder}...`);
    try {
      const res = await window.electronAPI?.runOrganizerTask(task, categories);
      setIsProcessing(false);
      if (res?.success) {
        setStatusMessage(`Completed! Moved ${res.movedCount} files.`);
        loadTasks();
      } else {
        setStatusMessage(`Error: ${res?.error || 'Failed to organize files'}`);
      }
    } catch (err) {
      setIsProcessing(false);
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      setStatusMessage(`Error: ${errMsg}`);
    }
  };

  return (
    <div className="page-content organizer-page">
      {/* Header Banner */}
      <div className="section-block">
        <h2 className="section-title">
          <FolderSync size={20} className="text-accent" />
          Organizer Media
        </h2>
        <p className="section-desc">
          Automatically routes media into dedicated subfolders (e.g. Images, Videos, Audio, Documents)
          matching your Aggregated Media Categories. Runs on demand or continuously in the background and tray.
        </p>
      </div>

      {/* Main Configuration Card */}
      <div className="organize-form-card">
        <div className="form-group">
          <label className="form-label">Select Folder To Organize</label>
          <div className="input-with-button">
            <input
              type="text"
              className="fluent-input flex-1"
              placeholder="Select folder to organize (e.g., Downloads, Unsorted Photos)..."
              value={sourceFolder}
              readOnly
            />
            <button className="fluent-button" onClick={handleSelectFolder}>
              <FolderInput size={16} />
              <span>Browse...</span>
            </button>
          </div>
        </div>

        {/* Auto Organizer Move Newer File Option */}
        <div className="form-group toggle-group">
          <div
            className="fluent-toggle-row"
            onClick={() => setMoveNewerOnly(!moveNewerOnly)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setMoveNewerOnly(!moveNewerOnly);
              }
            }}
          >
            <div
              className={`fluent-switch ${moveNewerOnly ? 'checked' : ''}`}
              role="switch"
              aria-checked={moveNewerOnly}
            >
              <div className="fluent-switch-thumb" />
            </div>
            <span className="fluent-switch-label">Auto-Organizer: Move Newer Files Only</span>
          </div>
          <span className="form-hint">
            When enabled, only files added or modified in the last 24 hours will be moved, leaving older archives intact.
          </span>
        </div>

        {/* Schedule & Trigger Options */}
        <div className="form-group">
          <label className="form-label icon-label">
            <Clock size={16} />
            <span>Execution Schedule & Trigger</span>
          </label>
          <select
            className="fluent-input"
            value={scheduleType}
            onChange={(e) => setScheduleType(e.target.value)}
          >
            <option value="tray">When I tap "Organize Media Now" in System Tray</option>
            <option value="30m">Every 30 Minutes (Automatic Background)</option>
            <option value="1h">Every 1 Hour (Automatic Background)</option>
            <option value="6h">Every 6 Hours (Automatic Background)</option>
            <option value="24h">Daily / Every 24 Hours</option>
          </select>
          <span className="form-hint">
            The organizer continues to run quietly in the system tray even when this window is closed.
          </span>
        </div>

        {/* Organization Mapping Preview */}
        <div className="routing-preview-box">
          <span className="routing-preview-title">Category Folder Routing:</span>
          <div className="routing-tags-grid">
            {Object.entries(categories).map(([k, cat]) => (
              <span key={k} className="routing-tag">
                {cat.label} &rarr; <code>{cat.folderName || cat.label}/</code>
              </span>
            ))}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="form-action-row">
          <button
            className="fluent-button primary large"
            onClick={handleOrganizeNow}
            disabled={isProcessing}
          >
            <Play size={16} />
            <span>{isProcessing ? 'Processing...' : 'Organize Now'}</span>
          </button>

          <button
            className="fluent-button large"
            onClick={handleSaveTask}
            disabled={isProcessing}
          >
            <Save size={16} />
            <span>{editingTaskId ? 'Update Task' : 'Save Auto-Organizer'}</span>
          </button>

          {editingTaskId && (
            <button
              className="fluent-button large secondary"
              onClick={() => {
                setEditingTaskId(null);
                setSourceFolder('');
              }}
            >
              Cancel Edit
            </button>
          )}
        </div>

        {statusMessage && (
          <div className="status-banner">
            <CheckCircle2 size={18} className="text-accent" />
            <span>{statusMessage}</span>
          </div>
        )}
      </div>

      {/* Manage Auto-Organizers Section */}
      <div className="section-block manage-tasks-block">
        <div className="section-header-row">
          <h3 className="section-title">
            <Settings2 size={18} />
            Manage Auto-Organizers
          </h3>
          <button className="fluent-button" onClick={loadTasks} title="Refresh Tasks">
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <FolderSync size={40} className="empty-icon" />
            <p>No Auto-Organizer tasks saved yet. Configure a folder above and click "Save Auto-Organizer".</p>
          </div>
        ) : (
          <div className="tasks-cards-list">
            {tasks.map((task) => (
              <div key={task.id} className={`task-card ${!task.enabled ? 'disabled' : ''}`}>
                <div className="task-info-col">
                  <div className="task-header-line">
                    <span className="task-path" title={task.sourceFolder}>
                      {task.sourceFolder}
                    </span>
                    <span className={`task-status-badge ${task.enabled ? 'active' : 'paused'}`}>
                      {task.enabled ? 'Active' : 'Paused'}
                    </span>
                  </div>

                  <div className="task-details-line">
                    <span className="task-schedule-tag">
                      Schedule:{' '}
                      {task.scheduleType === 'tray'
                        ? 'System Tray Trigger'
                        : `Every ${task.scheduleType}`}
                    </span>
                    {task.moveNewerOnly && <span className="task-newer-tag">Newer Files Only</span>}
                    {task.lastRun && (
                      <span className="task-last-run">Last run: {formatDate(task.lastRun)}</span>
                    )}
                  </div>
                </div>

                <div className="task-actions-col">
                  <button
                    className="fluent-button"
                    onClick={() => handleRunSavedTaskNow(task)}
                    title="Run Now"
                    disabled={isProcessing}
                  >
                    <Play size={14} />
                    <span>Run</span>
                  </button>

                  <button
                    className="fluent-button"
                    onClick={() => handleToggleTask(task.id)}
                    title={task.enabled ? 'Pause automation' : 'Enable automation'}
                  >
                    {task.enabled ? 'Pause' : 'Resume'}
                  </button>

                  <button
                    className="fluent-button"
                    onClick={() => handleEditTask(task)}
                    title="Edit Task"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    className="fluent-button danger-btn"
                    onClick={() => handleDeleteTask(task.id)}
                    title="Delete Task"
                  >
                    <Trash2 size={14} />
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
