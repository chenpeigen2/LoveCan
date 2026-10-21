import type { CSSProperties, ReactNode } from "react";
import { useTilt } from "@/hooks/useTilt";

interface TiltProps {
  children: ReactNode;
  className?: string;
  max?: number;
  style?: CSSProperties;
}

export function Tilt({ children, className = "", max = 4.5, style }: TiltProps) {
  const ref = useTilt<HTMLDivElement>(max);
  return (
    <div ref={ref} className={`tilt ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
