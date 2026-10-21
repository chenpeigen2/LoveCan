import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS } from "./prompts";

export interface AudioClip {
  blob: Blob;
  url: string;
  mime: string;
  duration: number;
}

export type RecorderStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "recorded"
  | "error";

export function isWeChatBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function isRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ];
  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type));
}

function permissionMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "没有拿到麦克风。你可以只写信，或者在设置里允许使用麦克风。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到麦克风。你可以只写信。";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风被别的程序占用了。关掉它，再试一次。";
  }
  if (name === "SecurityError") {
    return "这一页用不了麦克风。换一个浏览器再试一次。";
  }
  return "录音没有开始。再试一次，或者只写信。";
}

export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [clip, setClip] = useState<AudioClip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const clipUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const stopRef = useRef<() => void>(() => undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    clearTimer();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopStream();
    chunksRef.current = [];
    if (clipUrlRef.current) {
      URL.revokeObjectURL(clipUrlRef.current);
      clipUrlRef.current = null;
    }
    setClip(null);
    setElapsed(0);
    setError(null);
    setStatus("idle");
  }, [clearTimer, stopStream]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    clearTimer();
    recorder.stop();
  }, [clearTimer]);

  stopRef.current = stop;

  const start = useCallback(async () => {
    if (status === "requesting" || status === "recording") return;
    setError(null);
    setElapsed(0);

    if (!isRecordingSupported()) {
      setStatus("error");
      setError(
        isWeChatBrowser()
          ? "微信里可能录不了音。点右上角，在浏览器里打开。"
          : "这一页不能录音。你可以只写信。",
      );
      return;
    }

    setStatus("requesting");
    attemptRef.current += 1;
    const attempt = attemptRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || attempt !== attemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
            audioBitsPerSecond: 32000,
          })
        : new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        clearTimer();
        stopStream();
        setStatus("error");
        setError("录音中断了。再试一次，或者只写信。");
      };

      recorder.onstop = () => {
        const duration = Math.min(
          MAX_VOICE_SECONDS,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        );
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        chunksRef.current = [];
        stopStream();
        clearTimer();

        if (duration < 1 || blob.size < 1000) {
          if (mountedRef.current) {
            setStatus("idle");
            setElapsed(0);
            setError("太短了。再说一句吧。");
          }
          return;
        }

        if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
        const url = URL.createObjectURL(blob);
        clipUrlRef.current = url;
        if (mountedRef.current) {
          setClip({
            blob,
            url,
            mime: blob.type || recorder.mimeType || "audio/webm",
            duration,
          });
          setElapsed(duration);
          setStatus("recorded");
          setError(null);
        } else {
          URL.revokeObjectURL(url);
        }
      };

      startedAtRef.current = Date.now();
      recorder.start(250);
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const seconds = Math.min(
          MAX_VOICE_SECONDS,
          Math.floor((Date.now() - startedAtRef.current) / 1000),
        );
        if (mountedRef.current) setElapsed(seconds);
        if (seconds >= MAX_VOICE_SECONDS) stopRef.current();
      }, 250);
    } catch (caught) {
      stopStream();
      setStatus("error");
      setError(permissionMessage(caught));
    }
  }, [clearTimer, status, stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      clearTimer();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      stopStream();
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, [clearTimer, stopStream]);

  return {
    status,
    elapsed,
    clip,
    error,
    start,
    stop,
    reset,
    supported: isRecordingSupported(),
    wechat: isWeChatBrowser(),
    maxSeconds: MAX_VOICE_SECONDS,
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}
