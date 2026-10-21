import { Printer } from "lucide-react";
import { QrImage } from "./QrImage";

interface PrintDeskProps {
  shareUrl: string;
  manageUrl: string;
  onPrint: () => void;
  disabled?: boolean;
}

export function PrintDesk({
  shareUrl,
  manageUrl,
  onPrint,
  disabled = false,
}: PrintDeskProps) {
  return (
    <section className="print-desk" aria-labelledby="print-desk-title">
      <div className="print-desk-head">
        <div>
          <p className="eyebrow">The double card</p>
          <h2 id="print-desk-title">一张纸，两半钥匙。</h2>
        </div>
        <p>
          上半张寄给 TA，下半张留给自己。纸比链接更不容易丢。
        </p>
      </div>

      <div className="print-desk-tickets">
        <div className="print-ticket">
          <QrImage
            value={shareUrl}
            size={86}
            alt="给 TA 的拆封二维码"
          />
          <div>
            <span className="print-ticket-tag">上半张 · GIVE AWAY</span>
            <p>给 TA。扫一扫，拆开罐头。</p>
          </div>
        </div>
        <div className="print-ticket">
          <QrImage
            value={manageUrl}
            size={86}
            dark="#6d3a2b"
            alt="照看罐头的二维码"
          />
          <div>
            <span className="print-ticket-tag">下半张 · KEEP</span>
            <p>给你。扫一扫，照看或收回。</p>
          </div>
        </div>
      </div>

      <div className="print-desk-foot">
        <p>单面打印，沿中间的虚线剪开。</p>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onPrint}
          disabled={disabled || !shareUrl}
        >
          <Printer size={15} />
          打印双联卡
        </button>
      </div>
    </section>
  );
}
