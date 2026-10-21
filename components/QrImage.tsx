import { useMemo } from "react";
import { renderSVG } from "uqr";

interface QrImageProps {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
  className?: string;
  alt?: string;
}

export function QrImage({
  value,
  size = 220,
  dark = "#2b2621",
  light = "#fbf7ee",
  className,
  alt = "二维码",
}: QrImageProps) {
  const src = useMemo(() => {
    if (!value) return "";
    try {
      const svg = renderSVG(value, {
        border: 2,
        pixelSize: 8,
        blackColor: dark,
        whiteColor: light,
      });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return "";
    }
  }, [value, dark, light]);

  if (!src) return null;

  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt={alt}
    />
  );
}
