import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { playSound, unlockSound, type ActionSound } from "@/lib/sound";

interface WaxPressProps {
  onComplete: () => void;
  label: string;
  hint?: string;
  duration?: number;
  disabled?: boolean;
  variant?: "stamp" | "overlay";
  completeSound?: ActionSound;
  doneLabel?: string;
  onProgress?: (value: number) => void;
  resetSignal?: number;
  className?: string;
}

export function WaxPress({
  onComplete,
  label,
  hint,
  duration = 1200,
  disabled = false,
  variant = "stamp",
  completeSound = "stamp",
  doneLabel = "好了。",
  onProgress,
  resetSignal,
  className = "",
}: WaxPressProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [nudged, setNudged] = useState(false);
  const [done, setDone] = useState(false);
  const hintId = useId();

  const frameRef = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const doneRef = useRef(false);
  const startedAtRef = useRef(0);
  const reportedRef = useRef(0);
  const completeRef = useRef(onComplete);
  const progressRef = useRef(onProgress);
  completeRef.current = onComplete;
  progressRef.current = onProgress;

  const report = useCallback((value: number, force = false) => {
    if (!force && Math.abs(value - reportedRef.current) < 0.05) return;
    reportedRef.current = value;
    progressRef.current?.(value);
  }, []);

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      if (!holdingRef.current) return;
      const value = Math.min(1, (now - startedAtRef.current) / duration);
      setProgress(value);
      report(value, value >= 1);
      if (value >= 1) {
        holdingRef.current = false;
        doneRef.current = true;
        frameRef.current = null;
        setHolding(false);
        setDone(true);
        setNudged(false);
        if (navigator.vibrate) navigator.vibrate(14);
        playSound(completeSound);
        completeRef.current();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    },
    [completeSound, duration, report],
  );

  const start = useCallback(() => {
    if (disabled || doneRef.current || holdingRef.current) return;
    unlockSound();
    holdingRef.current = true;
    startedAtRef.current = window.performance.now();
    setHolding(true);
    setNudged(false);
    playSound("wax");
    frameRef.current = window.requestAnimationFrame(tick);
  }, [disabled, tick]);

  const cancel = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    stopFrame();
    setHolding(false);
    setProgress(0);
    reportedRef.current = 0;
    progressRef.current?.(0);
    if (!doneRef.current) setNudged(true);
  }, [stopFrame]);

  useEffect(() => {
    if (!disabled) return;
    holdingRef.current = false;
    stopFrame();
    setHolding(false);
  }, [disabled, stopFrame]);

  useEffect(() => {
    if (resetSignal === undefined) return;
    holdingRef.current = false;
    doneRef.current = false;
    stopFrame();
    setDone(false);
    setHolding(false);
    setNudged(false);
    setProgress(0);
    reportedRef.current = 0;
    progressRef.current?.(0);
  }, [resetSignal, stopFrame]);

  useEffect(() => {
    return () => {
      holdingRef.current = false;
      stopFrame();
    };
  }, [stopFrame]);

  const status = done
    ? doneLabel
    : holding
      ? "别松手，蜡正在变软……"
      : nudged
        ? "再按久一点，让蜡变软。"
        : label;

  return (
    <div
      className={`wax-press is-${variant} ${holding ? "is-holding" : ""} ${
        done ? "is-done" : ""
      } ${className}`.trim()}
      style={{ "--hold": progress } as CSSProperties}
    >
      <button
        type="button"
        className="wax-press-button"
        onPointerDown={(event) => {
          if (event.button !== 0 && event.pointerType === "mouse") return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          cancel();
        }}
        onBlur={cancel}
        onContextMenu={(event) => event.preventDefault()}
        disabled={disabled}
        aria-label={label}
        aria-describedby={hint ? hintId : undefined}
      >
        <span className="wax-press-halo" aria-hidden="true" />
        <span className="wax-press-handle" aria-hidden="true" />
        <span className="wax-press-disk" aria-hidden="true">
          <span className="wax-press-glyph">L</span>
        </span>
        <span className="wax-press-ring" aria-hidden="true" />
      </button>

      {variant === "stamp" ? (
        <div className="wax-press-copy">
          <p className="wax-press-status" aria-live="polite">
            {status}
          </p>
          {hint ? (
            <p className="wax-press-hint" id={hintId}>
              {hint}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <span className="sr-only" aria-live="polite">
            {status}
          </span>
          {hint ? (
            <span className="sr-only" id={hintId}>
              {hint}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
