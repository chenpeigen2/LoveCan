import { createPortal } from "react-dom";
import { formatLongDate, formatTime } from "@/lib/date";
import type { Skin } from "@/lib/prompts";
import { QrImage } from "./QrImage";

interface PrintCardsProps {
  serial: string;
  skin: Skin;
  sender: string;
  recipient: string;
  labelLine: string;
  unlockAt: string;
  createdAt: string;
  shareUrl: string;
  manageUrl: string;
}

export async function printCards(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    // Printing can continue with fallback fonts.
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  window.print();
}

function trimHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}/c/…`;
  } catch {
    return "lovecan";
  }
}

export function PrintCards(props: PrintCardsProps) {
  const unlockDate = new Date(props.unlockAt);
  const createdDate = new Date(props.createdAt);
  const time = formatTime(unlockDate);

  const sheet = (
    <div className="print-only" aria-hidden="true">
      <div className="print-sheet">
        <article className="print-card" data-skin={props.skin}>
          <div className="print-card-inner">
            <div>
              <div className="print-topline">
                <span>LoveCan · 爱意罐头</span>
                <span>NO. {props.serial}</span>
              </div>
              <p className="print-kicker">A letter, sealed in time</p>
              <div className="print-stamp" aria-hidden="true">
                <span>Love</span>
                <strong>CAN</strong>
                <span>1 letter</span>
              </div>
              <p className="print-gift-label">给</p>
              <h2 className="print-name">{props.recipient}</h2>
              <p className="print-line">{props.labelLine}</p>
            </div>
            <div className="print-date-block">
              <span>请在</span>
              <strong>{formatLongDate(unlockDate)}</strong>
              <span>{time} 之后打开</span>
            </div>
            <div className="print-bottom">
              <div className="print-instruction">
                <p className="print-instruction-title">扫一扫，拆开这罐东西</p>
                <p>把这一半放进信封，交给 TA。</p>
                <p className="print-url">lovecan · {trimHost(props.shareUrl)}</p>
              </div>
              <QrImage
                value={props.shareUrl}
                size={132}
                className="print-qr"
                alt={`打开给${props.recipient}的罐头`}
              />
            </div>
            <div className="print-from">
              <span>From</span>
              <span>{props.sender}</span>
            </div>
          </div>
        </article>

        <div className="print-cut">
          — 沿虚线剪开 · 上半张给 TA · 下半张留给自己 —
        </div>

        <article className="print-card print-card--stub">
          <div className="print-card-inner">
            <div className="print-topline">
              <span>LoveCan · 爱意罐头</span>
              <span>OWNER STUB</span>
            </div>
            <p className="print-kicker">Keep this half. It is the spare key.</p>
            <h2 className="print-stub-title">这只罐子的备用钥匙</h2>
            <p className="print-stub-meta">
              给 {props.recipient}
              <br />
              {formatLongDate(unlockDate)} {time} 到期
              <br />
              封于 {formatLongDate(createdDate)}
            </p>
            <div className="print-bottom">
              <div className="print-instruction">
                <p className="print-instruction-title">扫一扫，照看这只罐子</p>
                <p>可以重新打印卡片，也可以在到期前把它收回。</p>
                <p className="print-url">NO. {props.serial}</p>
              </div>
              <QrImage
                value={props.manageUrl}
                size={132}
                dark="#6d3a2b"
                light="#f4ecdc"
                className="print-qr"
                alt="照看这只罐头"
              />
            </div>
            <p className="print-warning">
              这张卡只有你有。别把它和上半张一起寄出去。
            </p>
          </div>
        </article>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
