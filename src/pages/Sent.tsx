import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { CanObject } from "@/components/CanObject";
import { KeyLinkCard } from "@/components/KeyLinkCard";
import { PrintCards, printCards } from "@/components/PrintCards";
import { PrintDesk } from "@/components/PrintDesk";
import { defaultLabelLine, formatLongDate, formatTime } from "@/lib/date";
import { readSealResult, deriveShareUrl } from "@/lib/seal-result";
import { readSavedCans } from "@/lib/saved-cans";
import { isCanId } from "@/lib/links";
import { isSkin, type Skin } from "@/lib/prompts";

interface SentView {
  id: string;
  sender: string;
  recipient: string;
  labelLine: string;
  unlockAt: string;
  createdAt: string;
  skin: Skin;
  shareUrl: string | null;
  manageUrl: string;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function MissingResult() {
  return (
    <PageShell narrow>
      <div className="center-state">
        <span className="empty-mark">?</span>
        <div>
          <p className="eyebrow">No receipt here</p>
          <h1 className="display-sm mt-3">这张回执不在这台设备上。</h1>
          <p className="body-copy mt-3 max-w-[26rem]">
            封罐记录只留在当时那台设备上。如果你打印了那张双联卡，
            扫下半张的二维码，就能回到照看这只罐子的那一页。
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/write/" className="btn btn-wax">
            再封一罐
            <ArrowRight size={15} />
          </Link>
          <Link to="/" className="btn btn-outline">
            回首页
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

export function Sent() {
  const { id = "" } = useParams();
  const view = useMemo<SentView | null>(() => {
    if (!id || !isCanId(id)) return null;
    const result = readSealResult(id);
    const saved = readSavedCans().find((item) => item.id === id);

    if (result) {
      return {
        id,
        sender: result.sender,
        recipient: result.recipient,
        labelLine: result.labelLine,
        unlockAt: result.unlockAt,
        createdAt: result.createdAt,
        skin: result.skin,
        shareUrl: result.shareUrl,
        manageUrl: result.manageUrl,
      };
    }

    if (!saved) return null;
    const unlock = new Date(saved.unlockAt);
    const created = new Date(saved.createdAt);
    return {
      id,
      sender: saved.sender ?? "我",
      recipient: saved.recipient,
      labelLine:
        saved.labelLine ??
        (Number.isNaN(unlock.getTime())
          ? "等一个春天"
          : defaultLabelLine(unlock)),
      unlockAt: saved.unlockAt,
      createdAt: Number.isNaN(created.getTime())
        ? new Date().toISOString()
        : saved.createdAt,
      skin: saved.skin && isSkin(saved.skin) ? saved.skin : "spring",
      shareUrl: deriveShareUrl(saved.manageUrl, id),
      manageUrl: saved.manageUrl,
    };
  }, [id]);

  if (!view) return <MissingResult />;

  const unlock = new Date(view.unlockAt);
  const created = new Date(view.createdAt);
  const validUnlock = !Number.isNaN(unlock.getTime());
  const validCreated = !Number.isNaN(created.getTime());
  const serial = view.id.slice(0, 6).toUpperCase();
  const dateLabel = validUnlock ? formatLongDate(unlock) : "某一天";
  const timeLabel = validUnlock ? formatTime(unlock) : "00:00";
  const shareUrl = view.shareUrl;

  const handlePrint = () => {
    if (!validUnlock || !validCreated || !shareUrl) return;
    void printCards();
  };

  return (
    <PageShell
      narrow
      right={<span className="status-stamp">Sealed</span>}
      footerNote="这一罐已经交给你了。接下来，交给时间。"
    >
      <section className="can-page-head">
        <div className="can-intro">
          <p className="eyebrow">Sealed · NO. {serial}</p>
          <h1 className="display-sm">封好了。</h1>
          <p className="body-copy max-w-[32rem]">
            它会在 {dateLabel} {timeLabel} 松开。
            <br />
            这之前，只有拿着钥匙的人能拆开。
          </p>
          <p className="hand text-[21px] leading-relaxed text-ink-3">
            给 {view.recipient}。到期之后随时可以拆，不必卡在那一秒。
          </p>
        </div>
        <div className="can-stage">
          <CanObject
            skin={view.skin}
            recipient={view.recipient}
            sender={view.sender}
            labelLine={view.labelLine}
            unlockAt={validUnlock ? view.unlockAt : null}
            serial={serial}
            size="medium"
          />
        </div>
      </section>

      <section aria-labelledby="links-title">
        <div className="section-head !py-0 !pb-2">
          <div>
            <p className="eyebrow">Two keys</p>
            <h2 id="links-title" className="mt-2 font-serif text-[1.5rem]">
              一条给 TA，一条给你。
            </h2>
          </div>
          <p className="max-w-[20rem] text-[12px] leading-relaxed text-ink-3">
            整条链接都要复制。最后那一长串也是钥匙的一部分。
          </p>
        </div>

        <div className="sent-grid">
          {shareUrl ? (
            <KeyLinkCard
              title={`给 ${view.recipient} 的链接`}
              tag="SHARE"
              note="发给 TA。发出去之前，别自己点开。"
              value={shareUrl}
              copyLabel="复制给 TA"
            />
          ) : (
            <div className="key-link is-share">
              <p className="key-link-note">
                分享链接暂时取不到。请用打印卡上的二维码。
              </p>
            </div>
          )}
          <KeyLinkCard
            title="只给你的链接"
            tag="OWNER"
            note="只用来照看和收回这只罐子。别发给 TA。"
            value={view.manageUrl}
            copyLabel="复制这条链接"
            tone="owner"
          >
            <Link to={pathOf(view.manageUrl)} className="btn btn-sm btn-outline">
              照看这只罐子
            </Link>
          </KeyLinkCard>
        </div>
      </section>

      <div className="mt-8">
        <PrintDesk
          shareUrl={shareUrl ?? ""}
          manageUrl={view.manageUrl}
          onPrint={handlePrint}
          disabled={!validUnlock || !validCreated || !shareUrl}
        />
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[30rem] text-[11.5px] leading-relaxed text-ink-3">
          这条链接只在你手里。丢了它，没人能替你收回这只罐子；但 TA 仍然可以在到期之后打开。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/write/" className="btn btn-primary btn-sm">
            再封一罐
          </Link>
          <Link to="/" className="btn btn-quiet btn-sm">
            回首页
          </Link>
        </div>
      </div>

      {validUnlock && validCreated && shareUrl ? (
        <PrintCards
          serial={serial}
          skin={view.skin}
          sender={view.sender}
          recipient={view.recipient}
          labelLine={view.labelLine}
          unlockAt={view.unlockAt}
          createdAt={view.createdAt}
          shareUrl={shareUrl}
          manageUrl={view.manageUrl}
        />
      ) : null}
    </PageShell>
  );
}
