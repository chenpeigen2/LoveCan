import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { base64ToBlob, formatDuration } from "@/lib/audio";

interface VoiceNoteProps {
  src?: string;
  base64?: string;
  mime?: string;
  duration?: number;
  label?: string;
  onPlayingChange?: (playing: boolean) => void;
}

const BAR_COUNT = 42;

function barsFor(seed: string): number[] {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    hash ^= index + 1;
    hash = Math.imul(hash, 16777619);
    const value = ((hash >>> 0) % 1000) / 1000;
    return 18 + Math.round(value * 82);
  });
}

export function VoiceNote({
  src,
  base64,
  mime = "audio/webm",
  duration,
  label = "一段留给你的声音",
  onPlayingChange,
}: VoiceNoteProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const generatedUrlRef = useRef<string | null>(null);
  const [generatedSrc, setGeneratedSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const playingCallbackRef = useRef(onPlayingChange);
  playingCallbackRef.current = onPlayingChange;

  useEffect(() => {
    playingCallbackRef.current?.(playing);
  }, [playing]);

  useEffect(() => {
    return () => playingCallbackRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!base64) {
      setGeneratedSrc(null);
      return;
    }
    const blob = base64ToBlob(base64, mime);
    const url = URL.createObjectURL(blob);
    generatedUrlRef.current = url;
    setGeneratedSrc(url);
    return () => {
      if (generatedUrlRef.current === url) {
        URL.revokeObjectURL(url);
        generatedUrlRef.current = null;
      }
    };
  }, [base64, mime]);

  const resolvedSrc = src ?? generatedSrc;
  const bars = useMemo(
    () => barsFor(`${resolvedSrc ?? "voice"}:${duration ?? 0}`),
    [resolvedSrc, duration],
  );

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setTotal(duration ?? 0);
  }, [resolvedSrc, duration]);

  if (!resolvedSrc) return null;

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const progress = total > 0 ? Math.min(1, current / total) : 0;

  return (
    <div className="voice-note">
      <audio
        ref={audioRef}
        src={resolvedSrc}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value) && value > 0) setTotal(value);
        }}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        className="voice-play"
        onClick={toggle}
        aria-label={playing ? "暂停这段声音" : "播放这段声音"}
      >
        {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
      </button>
      <div className="voice-main">
        <div className="voice-label">
          <span>{label}</span>
          <span>
            {formatDuration(current)} / {formatDuration(total || duration || 0)}
          </span>
        </div>
        <div
          className={`voice-wave ${playing ? "is-playing" : ""}`}
          aria-hidden="true"
        >
          {bars.map((height, index) => {
            const played = index / BAR_COUNT <= progress;
            return (
              <span
                key={index}
                className={`voice-bar ${played ? "is-played" : ""}`}
                style={{
                  height: `${height}%`,
                  animationDelay: `${(index % 9) * 70}ms`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
