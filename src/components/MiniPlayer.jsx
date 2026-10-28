import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, X, Music } from 'lucide-react';
import { formatDuration } from '../utils/formatters';
import { toMediaUrl } from '../utils/fileTypes';

export default function MiniPlayer({ currentTrack, onCloseTrack }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = toMediaUrl(currentTrack.path);
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [currentTrack]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  if (!currentTrack) return null;

  return (
    <div className="mini-player-bar">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Track Info */}
      <div className="player-track-info">
        <div className="player-disc-icon">
          <Music size={20} className="text-cyan" />
        </div>
        <div className="player-meta-text">
          <div className="player-title" title={currentTrack.name}>
            {currentTrack.name}
          </div>
          <div className="player-sub">Audio Player</div>
        </div>
      </div>

      {/* Controls */}
      <div className="player-center-controls">
        <div className="player-buttons-row">
          <button className="player-btn primary" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
        </div>

        <div className="player-timeline-row">
          <span className="time-label">{formatDuration(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="player-slider"
          />
          <span className="time-label">{formatDuration(duration)}</span>
        </div>
      </div>

      {/* Extra Actions */}
      <div className="player-right-actions">
        <button
          className="player-btn"
          onClick={() => {
            if (audioRef.current) {
              audioRef.current.muted = !isMuted;
              setIsMuted(!isMuted);
            }
          }}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button className="player-btn close" onClick={onCloseTrack} title="Close Player">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
