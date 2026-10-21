import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { CanObject } from "@/components/CanObject";
import { Countdown } from "@/components/Countdown";
import { KeyLinkCard } from "@/components/KeyLinkCard";
import { PrintCards, printCards } from "@/components/PrintCards";
import { PrintDesk } from "@/components/PrintDesk";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLongDate, formatTime } from "@/lib/date";
import {
  AAD_LABEL,
  decryptJson,
  type LabelPayload,
} from "@/lib/crypto";
import {
  ApiError,
  apiErrorMessage,
  getCan,
  revokeCan,
  type CanRecord,
  type CanState,
} from "@/lib/api";
import {
  buildManageUrl,
  buildShareUrl,
  isCanId,
  parseOwnerFragment,
} from "@/lib/links";

function stateLabel(state: CanState): string {
  switch (state) {
    case "sealed":
      return "Sealed";
    case "ready":
      return "Ready";
    case "opened":
      return "Opened";
    case "revoked":
      return "Returned";
  }
}

function LoadingState() {
  return (
    <div className="center-state">
      <p className="loading-mark">Fetching your can</p>
      <p className="font-letter text-[17px] text-ink-2">正在打开你的柜子……</p>
    </div>
  );
}

export function ManagePage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const owner = useMemo(
    () => parseOwnerFragment(location.hash),
    [location.hash],
  );

  const [can, setCan] = useState<CanRecord | null>(null);
  const [label, setLabel] = useState<LabelPayload | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCanId(id)) {
      setErrorCode("not_found");
      setLoading(false);
      return;
    }
    if (!owner) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorCode(null);
    setRevokeError(null);

    (async () => {
      try {
        const envelope = await getCan(id, owner.ownerToken);
        if (cancelled) return;
        setCan(envelope.can);
        setOffsetMs(new Date(envelope.serverNow).getTime() - Date.now());
        if (envelope.can.state !== "revoked" && envelope.can.labelCiphertext) {
          try {
            const payload = await decryptJson<LabelPayload>(
              owner.key,
              envelope.can.labelCiphertext,
              AAD_LABEL,
            );
            if (!cancelled) setLabel(payload);
          } catch {
            if (!cancelled) {
              setErrorCode("forbidden");
              setCan(null);
            }
            return;
          }
        }
        if (!cancelled) setLoading(false);
      } catch (caught) {
        if (cancelled) return;
        setErrorCode(caught instanceof ApiError ? caught.code : "unknown");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, owner, attempt]);

  const handleRevoke = async () => {
    if (!can || !owner || revoking) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      const result = await revokeCan(can.id, owner.ownerToken);
      setCan((current) =>
        current
          ? {
              ...current,
              state: "revoked",
              revokedAt: result.revokedAt,
              labelCiphertext: "",
              contentCiphertext: undefined,
            }
          : current,
      );
      setLabel(null);
      setOffsetMs(new Date(result.serverNow).getTime() - Date.now());
      setConfirmOpen(false);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "unknown";
      setRevokeError(apiErrorMessage(code));
    } finally {
      setRevoking(false);
    }
  };

  const shareUrl = owner
    ? buildShareUrl(window.location.origin, id, owner.key)
    : "";
  const manageUrl = owner
    ? buildManageUrl(window.location.origin, id, owner.ownerToken, owner.key)
    : "";
  const serial = id.slice(0, 6).toUpperCase();

  if (loading) {
    return (
      <PageShell narrow>
        <LoadingState />
      </PageShell>
    );
  }

  if (!owner) {
    return (
      <PageShell narrow right={<span className="header-note">Owner</span>}>
        <div className="center-state">
          <span className="empty-mark">
            <LockKeyhole size={26} />
          </span>
          <div>
            <p className="eyebrow">An incomplete owner link</p>
            <h1 className="display-sm mt-3">这条链接少了一段。</h1>
            <p className="body-copy mt-4 max-w-[30rem]">
              请从打印卡，或者封罐完成后的那一页，把整条链接重新复制一次。
              最后那一长串也要带上。
            </p>
          </div>
          <Link to="/" className="btn btn-outline">
            回首页
          </Link>
        </div>
      </PageShell>
    );
  }

  if (errorCode || !can) {
    const canRetry = errorCode === "network" || errorCode === "unknown";
    return (
      <PageShell narrow right={<span className="header-note">Owner</span>}>
        <div className="center-state">
          <span className="empty-mark">?</span>
          <div>
            <p className="eyebrow">The can is out of reach</p>
            <h1 className="display-sm mt-3">
              {apiErrorMessage(errorCode ?? "unknown")}
            </h1>
            <p className="body-copy mt-4 max-w-[30rem]">
              这条链接是唯一的钥匙。请确认整条链接都复制完整了，尤其是最后那一长串。
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {canRetry ? (
              <button
                type="button"
                className="btn btn-wax"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw size={15} />
                再试一次
              </button>
            ) : null}
            <Link to="/" className="btn btn-outline">
              回首页
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (can.state === "revoked") {
    return (
      <PageShell
        narrow
        right={<span className="status-stamp is-muted">Returned</span>}
        footerNote="这只罐子已经不在时间里了。"
      >
        <div className="tombstone">
          <span className="empty-mark">空</span>
          <div>
            <p className="eyebrow">Returned · NO. {serial}</p>
            <h1 className="display-sm mt-3">罐子已经收回。</h1>
            <p className="body-copy mt-4 max-w-[30rem]">
              信和声音已经不在了。TA 的链接现在会看到一只空罐子，
              没有办法再把它打开。
            </p>
            {can.revokedAt ? (
              <p className="mt-3 font-letter text-[14px] text-ink-3">
                收回于 {formatLongDate(new Date(can.revokedAt))}{" "}
                {formatTime(new Date(can.revokedAt))}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/write/" className="btn btn-wax">
              再封一罐
            </Link>
            <Link to="/" className="btn btn-outline">
              回首页
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const unlock = new Date(can.unlockAt);
  const created = new Date(can.createdAt);
  const openedAt = can.openedAt ? new Date(can.openedAt) : null;
  const validUnlock = !Number.isNaN(unlock.getTime());
  const validCreated = !Number.isNaN(created.getTime());
  const ready = can.state === "ready";
  const opened = can.state === "opened";
  const canRevoke = !opened;

  const handlePrint = () => {
    if (!label || !validUnlock || !validCreated) return;
    void printCards();
  };

  return (
    <PageShell
      narrow
      right={<span className="status-stamp">{stateLabel(can.state)}</span>}
      footerNote="这条链接只在你手里。它不能让你提前读到信。"
    >
      <section className="can-page-head">
        <div className="can-intro">
          <p className="eyebrow">
            Your can · NO. {serial}
            {validCreated ? ` · 封于 ${formatLongDate(created)}` : ""}
          </p>
          <h1 className="display-sm">这只罐子，归你照看。</h1>
          <p className="body-copy max-w-[32rem]">
            {opened && openedAt ? (
              <>
                TA 在 {formatLongDate(openedAt)} {formatTime(openedAt)} 拆开了它。
                <br />
                信还留在 TA 的链接里。
              </>
            ) : ready ? (
              "时间到了。TA 还没有拆。现在，它只是在等一双手。"
            ) : (
              <>
                它会在 {validUnlock ? formatLongDate(unlock) : "那个日子"}{" "}
                {validUnlock ? formatTime(unlock) : ""} 松开。
                <br />
                现在，只有你能把它收回。
              </>
            )}
          </p>

          {!opened && !ready && validUnlock ? (
            <div className="countdown-wrap">
              <Countdown
                target={unlock}
                offsetMs={offsetMs}
                onArrive={() => {
                  setCan((current) =>
                    current && current.state === "sealed"
                      ? { ...current, state: "ready" }
                      : current,
                  );
                }}
              />
              <div className="countdown-caption">
                <span>距离松开</span>
                <span>
                  {formatLongDate(unlock)} {formatTime(unlock)}
                </span>
              </div>
            </div>
          ) : null}

          {opened && shareUrl ? (
            <a href={shareUrl} className="btn btn-outline btn-sm">
              去看看 TA 读到的信
            </a>
          ) : null}
        </div>

        <div className="can-stage">
          {label ? (
            <CanObject
              skin={can.skin}
              recipient={label.recipientName}
              sender={label.senderName}
              labelLine={label.labelLine}
              unlockAt={can.unlockAt}
              serial={serial}
              size="medium"
              opening={opened}
              floating={!opened}
            />
          ) : null}
        </div>
      </section>

      <div className="manage-grid">
        <div className="manage-panel">
          {shareUrl ? (
            <KeyLinkCard
              title="给 TA 的链接"
              tag="SHARE"
              note={
                opened
                  ? "TA 已经拆开过了。这条链接仍然可以重读。"
                  : "再发一次给 TA。到期之后才能拆。"
              }
              value={shareUrl}
              copyLabel="复制给 TA"
            />
          ) : null}
          <KeyLinkCard
            title="只给你的链接"
            tag="OWNER"
            note="就是现在这一页。收好它，别发给 TA。"
            value={manageUrl}
            copyLabel="复制这条链接"
            tone="owner"
          />
        </div>

        <div className="manage-panel">
          <PrintDesk
            shareUrl={shareUrl}
            manageUrl={manageUrl}
            onPrint={handlePrint}
            disabled={!label || !validUnlock || !validCreated}
          />

          {canRevoke ? (
            <div>
              <div className="danger-zone">
                <div>
                  <p className="danger-zone-title">在到期之前收回这只罐子</p>
                  <p>
                    信和声音会从此消失，TA 的链接会变成一只空罐子。这个动作不能撤销。
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setRevokeError(null);
                    setConfirmOpen(true);
                  }}
                >
                  收回这只罐子
                </button>
              </div>
              {revokeError ? (
                <div className="notice mt-3" role="alert">
                  {revokeError}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-ink-3">
              已经被拆开的罐子不能收回。信和声音会留在这条链接里，供 TA 重读。
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="max-w-[30rem] text-[11.5px] leading-relaxed text-ink-3">
          {opened
            ? "这只罐子已经读过了。留好这条链接，信就一直都在。"
            : "收回是最后的办法。只要罐子还在，TA 就还有一封信可拆。"}
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

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="modal-paper sm:max-w-md">
          <p className="eyebrow">This cannot be undone</p>
          <DialogTitle className="display-sm !text-[1.8rem]">
            要把这只罐子收回吗？
          </DialogTitle>
          <DialogDescription className="text-[13.5px] leading-relaxed text-ink-2">
            信和声音会立刻消失。TA 再打开那条链接，只会看到一只空罐子。
            这一步不能撤销。
          </DialogDescription>
          <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setConfirmOpen(false)}
              disabled={revoking}
            >
              先留着
            </button>
            <button
              type="button"
              className="btn btn-wax btn-sm"
              onClick={() => void handleRevoke()}
              disabled={revoking}
            >
              {revoking ? "正在收回……" : "收回这只罐子"}
            </button>
          </div>
          {revokeError ? (
            <div className="notice" role="alert">
              {revokeError}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {label && shareUrl && validUnlock && validCreated ? (
        <PrintCards
          serial={serial}
          skin={can.skin}
          sender={label.senderName}
          recipient={label.recipientName}
          labelLine={label.labelLine}
          unlockAt={can.unlockAt}
          createdAt={can.createdAt}
          shareUrl={shareUrl}
          manageUrl={manageUrl}
        />
      ) : null}
    </PageShell>
  );
}
