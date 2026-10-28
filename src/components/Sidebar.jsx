import React from 'react';
import {
  LayoutDashboard,
  Eye,
  FolderOpen,
  FolderSync,
  FilterX,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function Sidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  counts,
}) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: counts?.totalFiles ? `${counts.totalFiles}` : null,
    },
    {
      id: 'review',
      label: 'Review Media',
      icon: Eye,
      badge: counts?.mediaFolders ? `${counts.mediaFolders} Folders` : null,
    },
    {
      id: 'watched',
      label: 'File Explorer',
      icon: FolderOpen,
      badge: counts?.drivesCount ? `${counts.drivesCount} Drives` : null,
    },
    {
      id: 'organizer',
      label: 'Organizer Media',
      icon: FolderSync,
    },
    {
      id: 'ignore',
      label: 'Ignore Pattern',
      icon: FilterX,
    },
  ];

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header / Toggle */}
      <div className="sidebar-header">
        <button
          className="sidebar-collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        {!isCollapsed && <span className="sidebar-heading">Navigation</span>}
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
            >
              {isActive && <div className="sidebar-active-pill" />}
              <div className="sidebar-item-icon">
                <Icon size={19} />
              </div>
              {!isCollapsed && (
                <div className="sidebar-item-content">
                  <span className="sidebar-item-label">{item.label}</span>
                  {item.badge && <span className="sidebar-item-badge">{item.badge}</span>}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Nav (Settings) */}
      <div className="sidebar-footer">
        <button
          className={`sidebar-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
          title={isCollapsed ? 'Settings' : undefined}
        >
          {activeTab === 'settings' && <div className="sidebar-active-pill" />}
          <div className="sidebar-item-icon">
            <SettingsIcon size={19} />
          </div>
          {!isCollapsed && (
            <div className="sidebar-item-content">
              <span className="sidebar-item-label">Settings</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
