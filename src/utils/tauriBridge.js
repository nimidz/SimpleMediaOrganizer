import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { startDrag as nativeStartDrag } from '@crabnebula/tauri-plugin-drag';

export function setupTauriBridge() {
  if (typeof window === 'undefined') return;

  // Check if running in Tauri
  const isTauri = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

  if (!isTauri && window.electronAPI) {
    // Already in Electron, nothing to do
    return;
  }

  const appWindow = getCurrentWindow();

  window.electronAPI = {
    // Window controls
    minimizeWindow: () => invoke('minimize_window'),
    maximizeWindow: () => invoke('toggle_maximize_window'),
    closeWindow: () => invoke('close_window'),
    isMaximized: () => invoke('is_window_maximized'),

    // Drive and path operations
    getDrives: () => invoke('get_drives'),
    selectDirectory: async () => {
      try {
        const selected = await openDialog({
          directory: true,
          multiple: false,
        });
        return selected || null;
      } catch (err) {
        console.error('Directory picker error:', err);
        return null;
      }
    },
    readFolder: (folderPath, customCategories = null) =>
      invoke('read_folder', { folderPath, customCategories }),
    openPath: (targetPath) => invoke('open_path', { targetPath }),
    revealInExplorer: (filePath) => invoke('reveal_in_explorer', { filePath }),
    getThumbnail: async (filePath) => {
      try {
        return await invoke('get_thumbnail', { filePath });
      } catch {
        return null;
      }
    },

    // File operations
    renameFile: (oldPath, newPath) => invoke('rename_file', { oldPath, newPath }),
    deleteFile: (filePath) => invoke('delete_file', { filePath }),
    copyFile: (src, dest) => invoke('copy_file', { src, dest }),
    moveFile: (src, dest) => invoke('move_file', { src, dest }),

    // Native Windows Explorer Clipboard (Copy / Cut directly to Windows Explorer)
    copyFilesToClipboard: (filePaths, isCut = false) =>
      invoke('copy_files_to_clipboard', { filePaths, isCut }),

    // Native Drag and drop to Windows Explorer / Desktop
    startDrag: async (filePath) => {
      try {
        const paths = Array.isArray(filePath) ? filePath : [filePath];
        await invoke('start_native_drag', { paths });
      } catch (err) {
        console.error('start_native_drag error, attempting plugin fallback:', err);
        try {
          const item = Array.isArray(filePath) ? filePath : [filePath];
          const icon = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAWElEQVRYR+3VwQkAIBAEQQ1s/2XZgPfgIe5gYmAB+3j3ZubpPnsLCEhAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECgFxAAj/8C5Y2gMhEAAAAASUVORK5CYII=";
          await nativeStartDrag({ item, icon });
        } catch (pluginErr) {
          console.error('nativeStartDrag fallback error:', pluginErr);
        }
      }
    },

    // Run on Startup
    getAutostart: () => invoke('get_autostart_status'),
    setAutostart: (enabled) => invoke('set_autostart_status', { enabled }),

    // High-Speed Fast Scanner
    startFastScan: (rootPath, customCategories = null) =>
      invoke('start_fast_scan', { rootPath, customCategories }),
    cancelFastScan: () => invoke('cancel_fast_scan'),
    onScanProgress: (callback) => {
      let disposed = false;
      let unlistenFn = null;
      listen('scan:progress', (event) => {
        if (!disposed && callback) callback(event.payload);
      }).then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlistenFn = fn;
        }
      });
      return () => {
        disposed = true;
        if (unlistenFn) unlistenFn();
      };
    },
    onScanComplete: (callback) => {
      let disposed = false;
      let unlistenFn = null;
      listen('scan:complete', (event) => {
        if (!disposed && callback) callback(event.payload);
      }).then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlistenFn = fn;
        }
      });
      return () => {
        disposed = true;
        if (unlistenFn) unlistenFn();
      };
    },

    // Auto-Organizer Service
    getOrganizerTasks: () => invoke('get_organizer_tasks'),
    saveOrganizerTasks: (tasks) => invoke('save_organizer_tasks', { tasks }),
    runOrganizerTask: (task, customCategories = null) =>
      invoke('run_organizer_task', { task, customCategories }),
    runAllOrganizerTasks: () => invoke('run_all_organizer_tasks'),
    onOrganizerCompleted: (callback) => {
      let disposed = false;
      let unlistenFn = null;
      listen('organizer:completed', (event) => {
        if (!disposed && callback) callback(event.payload);
      }).then((fn) => {
        if (disposed) {
          fn();
        } else {
          unlistenFn = fn;
        }
      });
      return () => {
        disposed = true;
        if (unlistenFn) unlistenFn();
      };
    },

    // Ignore Rules Service
    getIgnoreRules: () => invoke('get_ignore_rules'),
    saveIgnoreRules: (rules) => invoke('save_ignore_rules', { rules }),

    // Media Player helper
    getFileUrl: (filePath) => convertFileSrc(filePath),
  };
}
