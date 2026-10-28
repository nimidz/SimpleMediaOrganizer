import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Trash2,
  Film,
  Play,
  AlertCircle,
} from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';
import { toMediaUrl } from '../utils/fileTypes';

export default function Lightbox({ item, items = [], onClose, onDeleteCurrent }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const idx = items.findIndex((i) => i.path === item?.path);
    setCurrentIndex(idx !== -1 ? idx : 0);
    setZoom(1);
    setRotation(0);
    setVideoError(false);
  }, [item, items]);

  const activeItem = items[currentIndex] || item;

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setZoom(1);
      setRotation(0);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setZoom(1);
      setRotation(0);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, items]);

  if (!activeItem) return null;

  const isVideo = activeItem.category === 'video';

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {/* Top Header Bar */}
        <div className="lightbox-header">
          <div className="lightbox-info">
            <span className="lightbox-title">{activeItem.name}</span>
            <span className="lightbox-meta">
              {formatBytes(activeItem.size)} • {formatDate(activeItem.mtimeMs)} • ({currentIndex + 1} / {items.length})
            </span>
          </div>

          <div className="lightbox-tools">
            {!isVideo && (
              <>
                <button
                  className="lightbox-tool-btn"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                  title="Zoom In"
                >
                  <ZoomIn size={18} />
                </button>
                <button
                  className="lightbox-tool-btn"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                  title="Zoom Out"
                >
                  <ZoomOut size={18} />
                </button>
                <button
                  className="lightbox-tool-btn"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  title="Rotate 90°"
                >
                  <RotateCw size={18} />
                </button>
              </>
            )}

            {isVideo && (
              <button
                className="lightbox-tool-btn"
                onClick={() => window.electronAPI?.openPath(activeItem.path)}
                title="Play with External Player (VLC / Windows Media Player)"
              >
                <Play size={18} />
              </button>
            )}

            <button
              className="lightbox-tool-btn"
              onClick={() => window.electronAPI?.revealInExplorer(activeItem.path)}
              title="Reveal in Windows Explorer"
            >
              <ExternalLink size={18} />
            </button>

            <button className="lightbox-tool-btn close" onClick={onClose} title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Media Canvas */}
        <div className="lightbox-canvas">
          {currentIndex > 0 && (
            <button className="lightbox-nav-btn prev" onClick={handlePrev} title="Previous">
              <ChevronLeft size={36} />
            </button>
          )}

          <div className="lightbox-media-wrapper">
            {isVideo ? (
              videoError ? (
                <div className="lightbox-video-error-card">
                  <Film size={52} className="text-accent" />
                  <h3 className="error-title">Video Codec Requires Native Player</h3>
                  <p className="error-desc">
                    This video uses a format/codec (such as HEVC/H.265, MKV, or AC-3/DTS audio) that is not supported directly by internal web playback.
                  </p>
                  <button
                    className="fluent-button primary error-play-btn"
                    onClick={() => window.electronAPI?.openPath(activeItem.path)}
                  >
                    <Play size={16} />
                    <span>Open & Play in VLC / Media Player</span>
                  </button>
                </div>
              ) : (
                <video
                  src={toMediaUrl(activeItem.path)}
                  controls
                  autoPlay
                  className="lightbox-video"
                  onError={() => setVideoError(true)}
                />
              )
            ) : (
              <img
                src={toMediaUrl(activeItem.path)}
                alt={activeItem.name}
                className="lightbox-image"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
              />
            )}
          </div>

          {currentIndex < items.length - 1 && (
            <button className="lightbox-nav-btn next" onClick={handleNext} title="Next">
              <ChevronRight size={36} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
