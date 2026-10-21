import { useEffect, useRef, useState } from "react";
import { countdownParts, humanRemaining, pad2 } from "@/lib/date";

interface CountdownProps {
  target: Date;
  offsetMs?: number;
  onArrive?: () => void;
}

export function Countdown({ target, offsetMs = 0, onArrive }: CountdownProps) {
  const readNow = () => new Date(Date.now() + offsetMs);
  const [now, setNow] = useState(readNow);
  const arrivedRef = useRef(false);
  const arriveCallbackRef = useRef(onArrive);
  arriveCallbackRef.current = onArrive;

  useEffect(() => {
    arrivedRef.current = false;
    setNow(new Date(Date.now() + offsetMs));
    const timer = window.setInterval(() => {
      const next = new Date(Date.now() + offsetMs);
      setNow(next);
      if (next.getTime() >= target.getTime() && !arrivedRef.current) {
        arrivedRef.current = true;
        arriveCallbackRef.current?.();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target, offsetMs]);

  const parts = countdownParts(target, now);

  return (
    <div>
      <div className="countdown-grid" role="timer" aria-live="off">
        <div className="countdown-cell">
          <span className="countdown-value">{pad2(parts.days)}</span>
          <span className="countdown-label">天</span>
        </div>
        <div className="countdown-cell">
          <span className="countdown-value">{pad2(parts.hours)}</span>
          <span className="countdown-label">小时</span>
        </div>
        <div className="countdown-cell">
          <span className="countdown-value">{pad2(parts.minutes)}</span>
          <span className="countdown-label">分</span>
        </div>
        <div className="countdown-cell">
          <span className="countdown-value">{pad2(parts.seconds)}</span>
          <span className="countdown-label">秒</span>
        </div>
      </div>
      <p className="sr-only">{humanRemaining(target, now)}</p>
    </div>
  );
}
