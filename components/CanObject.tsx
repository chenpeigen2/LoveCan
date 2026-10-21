import type { CSSProperties, ReactNode } from "react";
import { formatShortDate } from "@/lib/date";
import type { Skin } from "@/lib/prompts";

type WaxState = "sealed" | "softening" | "cracked";

interface CanObjectProps {
  skin: Skin;
  recipient?: string;
  sender?: string;
  labelLine?: string;
  unlockAt?: string | null;
  serial?: string;
  size?: "mini" | "small" | "medium" | "hero";
  opening?: boolean;
  floating?: boolean;
  demo?: boolean;
  waxState?: WaxState;
  waxProgress?: number;
  waxControl?: ReactNode;
  className?: string;
}

function Sprig() {
  return (
    <svg
      className="can-sprig"
      viewBox="0 0 160 220"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M86 218C81 167 73 112 49 27"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <path
        d="M76 172C54 164 38 148 30 128C51 130 70 146 76 172Z"
        fill="currentColor"
        fillOpacity=".13"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M72 143C86 126 105 118 124 119C116 137 97 148 72 143Z"
        fill="currentColor"
        fillOpacity=".1"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M65 116C45 107 32 91 27 73C47 77 61 92 65 116Z"
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M61 94C73 77 89 67 108 66C103 84 87 95 61 94Z"
        fill="currentColor"
        fillOpacity=".09"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M55 66C39 58 29 44 26 28C42 33 53 46 55 66Z"
        fill="currentColor"
        fillOpacity=".11"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

export function CanObject({
  skin,
  recipient,
  sender,
  labelLine,
  unlockAt,
  serial,
  size = "medium",
  opening = false,
  floating = true,
  demo = false,
  waxState = "sealed",
  waxProgress,
  waxControl,
  className = "",
}: CanObjectProps) {
  const recipientLabel = recipient?.trim() || "TA";
  const senderLabel = sender?.trim() || "你";
  const line = labelLine?.trim() || "等一个春天";
  const target = unlockAt ? new Date(unlockAt) : null;
  const dateLabel =
    target && !Number.isNaN(target.getTime())
      ? formatShortDate(target)
      : "某一天";
  const serialLabel = demo
    ? "DEMO"
    : (serial ?? "000000").slice(0, 6).toUpperCase();
  const progress =
    waxProgress === undefined
      ? undefined
      : Math.max(0, Math.min(1, waxProgress));
  const resolvedWaxState: WaxState =
    opening || waxState === "cracked" ? "cracked" : waxState;

  return (
    <div
      className={`can-scene ${floating ? "" : "is-static"} ${
        opening ? "is-opening" : ""
      } ${className}`.trim()}
      data-skin={skin}
      data-size={size}
      data-wax={resolvedWaxState}
      style={
        progress === undefined
          ? undefined
          : ({ "--wax-progress": progress } as CSSProperties)
      }
      role={waxControl ? "group" : "img"}
      aria-label={`一只${
        skin === "spring" ? "春日" : skin === "winter" ? "冬日" : "夜色"
      }罐头，写给${recipientLabel}，${dateLabel}打开`}
    >
      <div className="can-shadow" />
      <Sprig />
      <div className="can-body">
        <span className="can-mouth" aria-hidden="true" />
        <span className="can-gloss" aria-hidden="true" />
        <div className="can-label">
          <div className="can-label-kicker">
            <span>Love, canned</span>
            <span>NO. {serialLabel}</span>
          </div>
          <div className="can-label-main">
            <span className="can-to">给</span>
            <span className="can-name">{recipientLabel}</span>
            <p className="can-line">{line}</p>
          </div>
          <div className="can-label-bottom">
            <span>
              <span className="can-open-label">Open on</span>
              <br />
              <span className="can-date">{dateLabel}</span>
            </span>
            <span style={{ textAlign: "right" }}>
              From
              <br />
              {senderLabel}
            </span>
          </div>
          <div className="can-stamp" aria-hidden="true">
            <span>Love</span>
            <strong>CAN</strong>
            <span>1 letter</span>
          </div>
        </div>
        <div className="can-wax">
          <span className="can-wax-art" aria-hidden="true">
            <span className="wax-glow" />
            <span className="wax-half wax-left" />
            <span className="wax-half wax-right" />
            <span className="wax-crack wax-crack-a" />
            <span className="wax-crack wax-crack-b" />
            <span className="wax-crack wax-crack-c" />
            <span className="wax-letter">L</span>
          </span>
          {waxControl ? (
            <div className="can-wax-control">{waxControl}</div>
          ) : null}
        </div>
      </div>
      <div className="can-lid" aria-hidden="true">
        <div className="can-tab" />
      </div>
      {demo ? <span className="can-demo-tag">Sample can</span> : null}
    </div>
  );
}
