import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

interface KeyLinkCardProps {
  title: string;
  tag: string;
  note: string;
  value: string;
  copyLabel: string;
  tone?: "share" | "owner";
  children?: ReactNode;
}

export function KeyLinkCard({
  title,
  tag,
  note,
  value,
  copyLabel,
  tone = "share",
  children,
}: KeyLinkCardProps) {
  return (
    <div className={`key-link is-${tone}`}>
      <div className="key-link-head">
        <span className="key-link-title">{title}</span>
        <span className="key-link-tag">{tag}</span>
      </div>
      <p className="key-link-note">{note}</p>
      <p className="key-link-value">{value}</p>
      <div className="key-link-actions">
        <CopyButton value={value} label={copyLabel} />
        {children}
      </div>
    </div>
  );
}
