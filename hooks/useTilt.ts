import { useEffect, useRef } from "react";

export function useTilt<T extends HTMLElement>(maxDegrees = 4.5) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    let frame = 0;
    let rotateX = 0;
    let rotateY = 0;

    const apply = () => {
      frame = 0;
      element.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
    };

    const handleMove = (event: PointerEvent) => {
      if (event.buttons > 0) return;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      rotateY = x * maxDegrees * 2;
      rotateX = -y * maxDegrees * 2;
      element.style.setProperty("--glow-x", `${(x + 0.5) * 100}%`);
      element.style.setProperty("--glow-y", `${(y + 0.5) * 100}%`);
      element.classList.add("is-tilting");
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    const reset = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      rotateX = 0;
      rotateY = 0;
      element.classList.remove("is-tilting");
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
    };

    element.addEventListener("pointermove", handleMove);
    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointercancel", reset);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", handleMove);
      element.removeEventListener("pointerleave", reset);
      element.removeEventListener("pointercancel", reset);
    };
  }, [maxDegrees]);

  return ref;
}
