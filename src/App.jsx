import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ReviewMedia from './components/ReviewMedia';
import FolderViewer from './components/FolderViewer';
import WatchedMedia from './components/WatchedMedia';
import OrganizerMedia from './components/OrganizerMedia';
import IgnorePatterns from './components/IgnorePatterns';
import Settings from './components/Settings';
import MiniPlayer from './components/MiniPlayer';
import Lightbox from './components/Lightbox';
import {
  getAllCategories,
  getCustomCategories,
  saveCustomCategories,
} from './utils/fileTypes';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [theme, setTheme] = useState('dark');

  // Categories system (Default + Custom)
  const [categories, setCategories] = useState(() => getAllCategories());

  // Drives & Scanner States
  const [drives, setDrives] = useState([]);
  const [activeScanPath, setActiveScanPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [summary, setSummary] = useState(null);
  const [folders, setFolders] = useState([]);

  // Folder Drilldown in Review Media
  const [drilldownFolder, setDrilldownFolder] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');

  // Media Player & Lightbox
  const [currentTrack, setCurrentTrack] = useState(null);
  const [lightboxState, setLightboxState] = useState({ isOpen: false, item: null, list: [] });

  const activeScanPathRef = React.useRef(activeScanPath);
  activeScanPathRef.current = activeScanPath;

  // Update theme class on body
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  }, [theme]);

  // Load drives on mount
  const loadDrives = async () => {
    if (window.electronAPI) {
      const detected = await window.electronAPI.getDrives();
      const sorted = [...detected].sort((a, b) =>
        a.path.toUpperCase().localeCompare(b.path.toUpperCase())
      );
      setDrives(sorted);

      // Auto scan first drive or default user directory if available
      if (sorted.length > 0 && !activeScanPathRef.current) {
        startScan(sorted[0].path);
      }
    } else {
      // Mock for browser dev environment
      setDrives([
        { name: 'Local Disk (C:)', path: 'C:\\', size: 512000000000, free: 230000000000 },
        { name: 'Data Drive (D:)', path: 'D:\\', size: 1000000000000, free: 640000000000 },
      ]);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  // Listen to scanner progress & completion
  useEffect(() => {
    if (!window.electronAPI) return;

    const cleanupProgress = window.electronAPI.onScanProgress((data) => {
      if (data?.summary) setSummary(data.summary);
      if (data?.folders && data.folders.length > 0) setFolders(data.folders);
    });

    const cleanupComplete = window.electronAPI.onScanComplete((data) => {
      setIsScanning(false);
      if (data?.success) {
        if (data.summary) setSummary(data.summary);
        if (data.folders) setFolders(data.folders);
      }
    });

    const cleanupOrganizer = window.electronAPI.onOrganizerCompleted(() => {
      // If active scan path exists, refresh scan
      if (activeScanPathRef.current) {
        startScan(activeScanPathRef.current);
      }
    });

    return () => {
      cleanupProgress?.();
      cleanupComplete?.();
      cleanupOrganizer?.();
    };
  }, []);

  // Start fast scan
  const startScan = (targetPath) => {
    if (!targetPath) return;
    setActiveScanPath(targetPath);
    setIsScanning(true);
    setDrilldownFolder(null);

    if (window.electronAPI) {
      window.electronAPI.startFastScan(targetPath, categories);
    }
  };

  const cancelScan = () => {
    if (window.electronAPI) {
      window.electronAPI.cancelFastScan();
    }
    setIsScanning(false);
  };

  // Custom folder selection dialog
  const selectCustomFolder = async () => {
    if (window.electronAPI) {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        startScan(selected);
      }
    }
  };

  // Add custom category
  const handleAddCustomCategory = (newCat) => {
    const existing = getCustomCategories();
    existing[newCat.id] = newCat;
    saveCustomCategories(existing);
    const updated = getAllCategories();
    setCategories(updated);

    // Re-scan with new category mapping
    if (activeScanPath) {
      startScan(activeScanPath);
    }
  };

  // Update existing category (custom or default override)
  const handleUpdateCategory = (catId, updatedCat) => {
    const existing = getCustomCategories();
    existing[catId] = updatedCat;
    saveCustomCategories(existing);
    const updated = getAllCategories();
    setCategories(updated);

    if (activeScanPath) {
      startScan(activeScanPath);
    }
  };

  // Delete custom category or reset default category
  const handleDeleteCustomCategory = (catId) => {
    const existing = getCustomCategories();
    delete existing[catId];
    saveCustomCategories(existing);
    const updated = getAllCategories();
    setCategories(updated);

    if (activeScanPath) {
      startScan(activeScanPath);
    }
  };

  // Category selection handler from Dashboard
  const handleSelectCategory = (categoryId) => {
    setActiveCategory(categoryId);
    setDrilldownFolder(null);
    setActiveTab('review');
  };

  // Open folder drilldown inside Review Media
  const handleOpenFolder = (folderPath, folderName, initialCategory = 'all') => {
    setDrilldownFolder({ path: folderPath, name: folderName, initialCategory });
  };

  // Lightbox handlers
  const openLightbox = (item, list) => {
    setLightboxState({ isOpen: true, item, list });
  };

  const closeLightbox = () => {
    setLightboxState({ isOpen: false, item: null, list: [] });
  };

  return (
    <div className="app-container">
      {/* Windows 11 TitleBar */}
      <TitleBar
        currentPath={drilldownFolder ? drilldownFolder.path : activeScanPath}
        isScanning={isScanning}
        onCancelScan={cancelScan}
      />

      {/* Main Layout */}
      <div className="app-main-body">
        {/* Left Sidebar (Windows Settings / Task Manager Style) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'review') setDrilldownFolder(null);
          }}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          counts={{
            totalFiles: summary?.totalFiles || 0,
            mediaFolders: folders?.length || 0,
            drivesCount: drives?.length || 0,
          }}
        />

        {/* Page Area */}
        <main className="page-container">
          {activeTab === 'dashboard' && (
            <Dashboard
              summary={summary}
              drives={drives}
              activeScanPath={activeScanPath}
              categories={categories}
              onStartScan={startScan}
              onSelectDrive={startScan}
              onSelectCategory={handleSelectCategory}
              onSelectCustomFolder={selectCustomFolder}
              onAddCustomCategory={handleAddCustomCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCustomCategory}
            />
          )}

          {activeTab === 'review' &&
            (drilldownFolder ? (
              <FolderViewer
                folderPath={drilldownFolder.path}
                folderName={drilldownFolder.name}
                initialCategory={drilldownFolder.initialCategory || activeCategory}
                categories={categories}
                onBack={() => setDrilldownFolder(null)}
                onOpenLightbox={openLightbox}
                onPlayAudio={(track) => setCurrentTrack(track)}
              />
            ) : (
              <ReviewMedia
                folders={folders}
                onFoldersChange={setFolders}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
                categories={categories}
                onOpenFolder={handleOpenFolder}
                onPlayAudio={(track) => setCurrentTrack(track)}
              />
            ))}

          {activeTab === 'watched' && (
            <WatchedMedia
              drives={drives}
              onOpenFolderInReview={handleOpenFolder}
              onOpenLightbox={openLightbox}
              onPlayAudio={(track) => setCurrentTrack(track)}
            />
          )}

          {activeTab === 'organizer' && (
            <OrganizerMedia categories={categories} />
          )}

          {activeTab === 'ignore' && <IgnorePatterns />}

          {activeTab === 'settings' && (
            <Settings
              theme={theme}
              setTheme={setTheme}
              onRescanDrives={loadDrives}
              categories={categories}
              onDeleteCustomCategory={handleDeleteCustomCategory}
            />
          )}
        </main>
      </div>

      {/* Bottom Persistent Audio Player */}
      <MiniPlayer
        currentTrack={currentTrack}
        onCloseTrack={() => setCurrentTrack(null)}
      />

      {/* Full Media Lightbox */}
      {lightboxState.isOpen && (
        <Lightbox
          item={lightboxState.item}
          items={lightboxState.list}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
