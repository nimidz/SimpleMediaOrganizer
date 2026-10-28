import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, FileText, Play, Image as ImageIcon, Archive, Disc } from 'lucide-react';
import { toMediaUrl } from '../utils/fileTypes';

// Shared client cache across the session for zero-latency re-renders
const clientThumbnailCache = new Map();

export default function MediaThumbnail({ item, onPlayAudio, className = '' }) {
  const containerRef = useRef(null);
  const filePath = item?.path;
  const category = item?.category || 'other';
  const isVideo = category === 'video';
  const isAudio = category === 'audio';
  const isImage = category === 'image';
  const isDoc = category === 'document';
  const isArchive = category === 'archive';
  const isDisc = category === 'iso' || item?.extension?.toLowerCase() === '.iso';

  const [isVisible, setIsVisible] = useState(() => (filePath ? clientThumbnailCache.has(filePath) : false));
  const [nativeThumb, setNativeThumb] = useState(() => (filePath ? clientThumbnailCache.get(filePath) || null : null));
  const [imgError, setImgError] = useState(false);

  // Synchronize state immediately whenever item or filePath changes (e.g. category switch)
  useEffect(() => {
    setImgError(false);
    if (!filePath) {
      setNativeThumb(null);
      setIsVisible(false);
      return;
    }
    if (clientThumbnailCache.has(filePath)) {
      setNativeThumb(clientThumbnailCache.get(filePath));
      setIsVisible(true);
      return;
    }
    setNativeThumb(null);
    const node = containerRef.current;
    if (!node || !window.IntersectionObserver) {
      setIsVisible(true);
    } else {
      const rect = node.getBoundingClientRect();
      if (rect.top < window.innerHeight + 250 && rect.bottom > -250) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    }
  }, [filePath]);

  // 1. Viewport Lazy-Loading: only request media/thumbnails when card enters viewport
  useEffect(() => {
    if (isVisible || !filePath) return;

    if (clientThumbnailCache.has(filePath)) {
      setIsVisible(true);
      setNativeThumb(clientThumbnailCache.get(filePath));
      return;
    }

    const node = containerRef.current;
    if (!node || !window.IntersectionObserver) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '200px 0px', // preload slightly before entering viewport
        threshold: 0.01,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filePath, isVisible]);

  // 2. Fetch native Windows Shell thumbnail for video and audio once visible
  useEffect(() => {
    if (!isVisible || !filePath || (!isVideo && !isAudio)) return;

    if (clientThumbnailCache.has(filePath)) {
      setNativeThumb(clientThumbnailCache.get(filePath));
      return;
    }

    let isMounted = true;
    if (window.electronAPI?.getThumbnail) {
      window.electronAPI
        .getThumbnail(filePath)
        .then((thumbUrl) => {
          if (isMounted) {
            clientThumbnailCache.set(filePath, thumbUrl || null);
            if (thumbUrl) setNativeThumb(thumbUrl);
          }
        })
        .catch(() => {
          if (isMounted) clientThumbnailCache.set(filePath, null);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [isVisible, filePath, isVideo, isAudio]);

  // Placeholder while card is off-screen
  if (!isVisible) {
    return (
      <div ref={containerRef} className={`media-thumbnail-placeholder ${className}`}>
        <div className="skeleton-thumb-shimmer"></div>
      </div>
    );
  }

  // 1. Image Thumbnail
  if (isImage) {
    if (imgError && !nativeThumb) {
      return (
        <div ref={containerRef} className={`media-fallback-preview image ${className}`}>
          <ImageIcon size={34} />
          <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'IMG'}</span>
        </div>
      );
    }
    return (
      <div ref={containerRef} className={`media-thumb-wrapper ${className}`}>
        <img
          src={nativeThumb || toMediaUrl(filePath)}
          alt={item?.name || 'Image'}
          className="media-img"
          loading="lazy"
          onError={() => {
            if (!nativeThumb && window.electronAPI?.getThumbnail) {
              window.electronAPI
                .getThumbnail(filePath)
                .then((thumb) => {
                  if (thumb) {
                    setNativeThumb(thumb);
                  } else {
                    setImgError(true);
                  }
                })
                .catch(() => setImgError(true));
            } else {
              setImgError(true);
            }
          }}
        />
      </div>
    );
  }

  // 2. Video Thumbnail (Pure Image — NO raw <video> tags to preserve 60 FPS and low RAM)
  if (isVideo) {
    if (nativeThumb) {
      return (
        <div ref={containerRef} className={`media-video-thumb-container ${className}`}>
          <img src={nativeThumb} alt={item?.name || 'Video'} className="media-img" loading="lazy" />
          <div className="media-video-overlay-badge">
            <Film size={12} />
            <span>{item?.extension?.toUpperCase() || 'VIDEO'}</span>
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`media-fallback-preview video ${className}`}>
        <Film size={34} />
        <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'VIDEO'}</span>
      </div>
    );
  }

  // 3. Audio Thumbnail (Album Cover Art or Waveform Card)
  if (isAudio) {
    if (nativeThumb) {
      return (
        <div ref={containerRef} className={`media-audio-thumb-container ${className}`}>
          <img src={nativeThumb} alt={item?.name || 'Audio Cover'} className="media-img" loading="lazy" />
          {onPlayAudio && (
            <button
              className="play-overlay-btn"
              onClick={(e) => {
                e.stopPropagation();
                onPlayAudio(item);
              }}
              title="Play Audio"
            >
              <Play size={16} />
            </button>
          )}
          <div className="media-audio-overlay-badge">
            <Music size={12} />
            <span>{item?.extension?.toUpperCase() || 'AUDIO'}</span>
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={`media-fallback-preview audio waveform-card ${className}`}>
        <div className="audio-waveform-bars">
          <span className="wave-bar bar-1"></span>
          <span className="wave-bar bar-2"></span>
          <span className="wave-bar bar-3"></span>
          <span className="wave-bar bar-4"></span>
          <span className="wave-bar bar-5"></span>
          <span className="wave-bar bar-6"></span>
          <span className="wave-bar bar-7"></span>
        </div>
        {onPlayAudio && (
          <button
            className="play-overlay-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPlayAudio(item);
            }}
            title="Play Audio"
          >
            <Play size={16} />
          </button>
        )}
        <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'AUDIO'}</span>
      </div>
    );
  }

  // 4. Document Thumbnail
  if (isDoc) {
    return (
      <div ref={containerRef} className={`media-fallback-preview doc ${className}`}>
        <FileText size={34} />
        <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'DOC'}</span>
      </div>
    );
  }

  // 5. Disc Image (.iso, etc.)
  if (isDisc) {
    return (
      <div ref={containerRef} className={`media-fallback-preview iso ${className}`}>
        <Disc size={34} />
        <span className="media-ext-tag">{item?.extension?.replace('.', '').toUpperCase() || 'ISO'}</span>
      </div>
    );
  }

  // 6. Archive Thumbnail
  if (isArchive) {
    return (
      <div ref={containerRef} className={`media-fallback-preview archive ${className}`}>
        <Archive size={34} />
        <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'ZIP'}</span>
      </div>
    );
  }

  // 7. Generic Fallback
  return (
    <div ref={containerRef} className={`media-fallback-preview generic ${className}`}>
      <FileText size={34} />
      <span className="media-ext-tag">{item?.extension?.toUpperCase() || 'FILE'}</span>
    </div>
  );
}
