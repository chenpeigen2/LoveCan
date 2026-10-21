import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, LockKeyhole, RefreshCw } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { PageShell } from "@/components/PageShell";
import { CanObject } from "@/components/CanObject";
import { Countdown } from "@/components/Countdown";
import { Tilt } from "@/components/Tilt";
import { VoiceNote } from "@/components/VoiceNote";
import { WaxPress } from "@/components/WaxPress";
import { playSound } from "@/lib/sound";
import {
  formatLongDate,
  formatTime,
} from "@/lib/date";
import {
  AAD_CONTENT,
  AAD_LABEL,
  cryptoAvailable,
  decryptJson,
  deriveOpenToken,
  type ContentPayload,
  type LabelPayload,
} from "@/lib/crypto";
import {
  ApiError,
  apiErrorMessage,
  getCan,
  openCan,
  type CanRecord,
} from "@/lib/api";
import { isCanId, parseShareFragment } from "@/lib/links";

type Phase =
  | "loading"
  | "missing-key"
  | "sealed"
  | "ready"
  | "opening"
  | "letter"
  | "revoked"
  | "error";

function LoadingState() {
  return (
    <div className="center-state">
      <p className="loading-mark">Fetching the can</p>
      <p className="font-letter text-[17px] text-ink-2">正在把罐子取出来……</p>
    </div>
  );
}

export function CanPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const key = useMemo(
    () => parseShareFragment(location.hash),
    [location.hash],
  );

  const [phase, setPhase] = useState<Phase>("loading");
  const [can, setCan] = useState<CanRecord | null>(null);
  const [label, setLabel] = useState<LabelPayload | null>(null);
  const [content, setContent] = useState<ContentPayload | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [errorCode, setErrorCode] = useState<string>("unknown");
  const [openError, setOpenError] = useState<string | null>(null);
  const [openingBusy, setOpeningBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [openedNow, setOpenedNow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [waxProgress, setWaxProgress] = useState(0);
  const [waxCracked, setWaxCracked] = useState(false);
  const [waxReset, setWaxReset] = useState(0);

  const openingTimerRef = useRef<number | null>(null);
  const justOpenedRef = useRef(false);

  useEffect(() => {
    if (!isCanId(id)) {
      setErrorCode("not_found");
      setPhase("error");
      return;
    }
    if (!key) {
      setPhase("missing-key");
      return;
    }

    let cancelled = false;
    setPhase("loading");
    setErrorCode("unknown");
    setOpenError(null);
    setContent(null);
    setLabel(null);
    setCan(null);
    setListening(false);
    setOpenedNow(false);
    setWaxCracked(false);
    setWaxProgress(0);
    setWaxReset((value) => value + 1);

    (async () => {
      try {
        const envelope = await getCan(id);
        if (cancelled) return;
        setCan(envelope.can);
        setOffsetMs(new Date(envelope.serverNow).getTime() - Date.now());

        if (envelope.can.state === "revoked") {
          setPhase("revoked");
          return;
        }

        let labelPayload: LabelPayload;
        try {
          labelPayload = await decryptJson<LabelPayload>(
            key,
            envelope.can.labelCiphertext,
            AAD_LABEL,
          );
        } catch {
          setErrorCode("forbidden");
          setPhase("error");
          return;
        }
        if (cancelled) return;
        setLabel(labelPayload);

        if (envelope.can.state === "opened") {
          if (!envelope.can.contentCiphertext) {
            setErrorCode("invalid_response");
            setPhase("error");
            return;
          }
          const payload = await decryptJson<ContentPayload>(
            key,
            envelope.can.contentCiphertext,
            AAD_CONTENT,
          );
          if (cancelled) return;
          setContent(payload);
          setPhase("letter");
          return;
        }

        setPhase(envelope.can.state === "ready" ? "ready" : "sealed");
      } catch (caught) {
        if (cancelled) return;
        setErrorCode(caught instanceof ApiError ? caught.code : "unknown");
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, key, attempt]);

  useEffect(() => {
    return () => {
      if (openingTimerRef.current !== null) {
        window.clearTimeout(openingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (phase !== "letter" || !justOpenedRef.current) return;
    justOpenedRef.current = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById("the-letter")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }, [phase]);

  const resetWax = () => {
    setWaxCracked(false);
    setWaxProgress(0);
    setWaxReset((value) => value + 1);
  };

  const handleOpen = async () => {
    if (!can || !key || openingBusy) return;
    if (!cryptoAvailable()) {
      setOpenError(apiErrorMessage("crypto_unavailable"));
      resetWax();
      return;
    }
    setOpeningBusy(true);
    setOpenError(null);
    setPhase("opening");
    try {
      const openToken = await deriveOpenToken(key);
      const result = await openCan(can.id, openToken);
      const payload = await decryptJson<ContentPayload>(
        key,
        result.contentCiphertext,
        AAD_CONTENT,
      );
      setContent(payload);
      setCan((current) =>
        current
          ? {
              ...current,
              state: "opened",
              openedAt: result.openedAt,
              contentCiphertext: result.contentCiphertext,
            }
          : current,
      );
      setOffsetMs(new Date(result.serverNow).getTime() - Date.now());
      setOpenedNow(true);
      justOpenedRef.current = true;

      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      openingTimerRef.current = window.setTimeout(
        () => {
          playSound("chime");
          setPhase("letter");
          openingTimerRef.current = null;
        },
        reduce ? 280 : 1450,
      );
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : "unknown";
      if (code === "revoked") {
        setPhase("revoked");
      } else {
        setPhase("ready");
        setOpenError(
          code === "locked"
            ? "还差一点点。再等几秒，然后刷新这一页。"
            : apiErrorMessage(code),
        );
      }
      resetWax();
    } finally {
      setOpeningBusy(false);
    }
  };

  const reply = () => {
    if (!label) return;
    navigate(`/write/?reply=${id}`, {
      state: {
        senderName: label.recipientName,
        recipientName: label.senderName,
        labelLine: "换我等你",
      },
    });
  };

  const serial = id.slice(0, 6).toUpperCase();
  const headerRight =
    phase === "sealed" ? (
      <span className="status-stamp">Sealed</span>
    ) : phase === "ready" || phase === "opening" ? (
      <span className="status-stamp">Ready</span>
    ) : phase === "letter" ? (
      <span className="status-stamp is-muted">Opened</span>
    ) : phase === "revoked" ? (
      <span className="status-stamp is-muted">Returned</span>
    ) : (
      <span className="header-note">One can</span>
    );

  let body: ReactNode;

  if (phase === "loading") {
    body = <LoadingState />;
  } else if (phase === "missing-key") {
    body = (
      <div className="center-state">
        <span className="empty-mark">
          <LockKeyhole size={26} />
        </span>
        <div>
          <p className="eyebrow">A link without its key</p>
          <h1 className="display-sm mt-3">这条链接少了一把钥匙。</h1>
          <p className="body-copy mt-4 max-w-[30rem]">
            信和声音都锁着。请让寄件人把整条链接再发一次——
            最后那一长串也是钥匙的一部分。少了它，谁也打不开。
          </p>
        </div>
        <Link to="/" className="btn btn-outline">
          回首页
        </Link>
      </div>
    );
  } else if (phase === "error") {
    const canRetry = errorCode === "network" || errorCode === "unknown";
    body = (
      <div className="center-state">
        <span className="empty-mark">
          {errorCode === "forbidden" ? <LockKeyhole size={26} /> : "?"}
        </span>
        <div>
          <p className="eyebrow">The can is out of reach</p>
          <h1 className="display-sm mt-3">{apiErrorMessage(errorCode)}</h1>
          <p className="body-copy mt-4 max-w-[30rem]">
            {errorCode === "forbidden"
              ? "链接可能被截断，或者被换过一段。请向寄件人再要一次完整链接。"
              : errorCode === "not_found"
                ? "也许链接缺了一段。可以请寄件人重新发一次。"
                : "罐子还在，只是这一下没接上。再试一次就好。"}
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
    );
  } else if (phase === "revoked") {
    body = (
      <div className="tombstone">
        <span className="empty-mark">空</span>
        <div>
          <p className="eyebrow">Returned before the day</p>
          <h1 className="display-sm mt-3">罐子空了。</h1>
          <p className="body-copy mt-4 max-w-[30rem]">
            寄件人在到期之前，把这罐东西收了回去。信和声音都已经不在了。
          </p>
          <p className="mt-3 font-letter text-[15px] text-ink-3">
            有些话，最后还是留在了那个人的手里。
          </p>
        </div>
        <Link to="/" className="btn btn-outline">
          回首页
        </Link>
      </div>
    );
  } else if (phase === "letter") {
    if (!label || !content || !can) {
      body = <LoadingState />;
    } else {
      const openedAt = can.openedAt ? new Date(can.openedAt) : new Date();
      const createdAt = new Date(label.createdAt);
      const daysInTime =
        Number.isNaN(createdAt.getTime()) || Number.isNaN(openedAt.getTime())
          ? null
          : Math.max(0, differenceInCalendarDays(openedAt, createdAt));

      body = (
        <div>
          <div className="can-page-head">
            <div className="can-intro">
              <p className="eyebrow">
                Opened · NO. {serial} · {formatLongDate(openedAt)}
              </p>
              <h1 className="display-sm">
                {openedNow ? "它松开了。" : "它已经被拆开过了。"}
              </h1>
              <p className="body-copy max-w-[31rem]">
                {openedNow
                  ? "蜡封已经断开，信和声音都还在。慢慢读。"
                  : `在 ${formatLongDate(openedAt)} ${formatTime(openedAt)}，有人把它拆开了。信还在这里。`}
              </p>
            </div>
            <div className="can-stage">
              <CanObject
                skin={can.skin}
                recipient={label.recipientName}
                sender={label.senderName}
                labelLine={label.labelLine}
                unlockAt={can.unlockAt}
                serial={serial}
                size="medium"
                floating={false}
                opening
              />
            </div>
          </div>

          <section className="letter-wrap" id="the-letter">
            <div className="letter-sheet letter-reveal">
              <span className="letter-wax" aria-hidden="true">
                L
              </span>
              <div className="letter-meta">
                <span>
                  TO {label.recipientName} · FROM {label.senderName}
                </span>
                <span>
                  封于 {formatLongDate(createdAt)} · 拆于{" "}
                  {formatLongDate(openedAt)}
                </span>
              </div>
              <p className="letter-body">{content.letter}</p>
              <div className="letter-fold">
                {daysInTime === null
                  ? "这封信在时间里待过一阵子。现在，它是你的了。"
                  : daysInTime > 0
                    ? `这封信在时间里待了 ${daysInTime} 天。现在，它是你的了。`
                    : "这封信没有等太久。现在，它是你的了。"}
              </div>
            </div>

            {content.audio ? (
              <div>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="eyebrow">A voice for you</p>
                    <h2 className="mt-1 font-serif text-[1.25rem]">
                      还有一段声音。
                    </h2>
                  </div>
                  <p className="text-[11.5px] text-ink-3">
                    播放的时候，灯会暗一点。这是故意的。
                  </p>
                </div>
                <VoiceNote
                  base64={content.audio.base64}
                  mime={content.audio.mime}
                  duration={content.audio.duration}
                  label={`${label.senderName} 留给你的声音`}
                  onPlayingChange={setListening}
                />
              </div>
            ) : null}

            <div className="reply-card">
              <div>
                <p className="eyebrow">A can back</p>
                <h2 className="mt-2 font-serif text-[1.4rem]">
                  想回一罐吗？
                </h2>
                <p className="mt-2 max-w-[28rem] text-[13px] leading-relaxed text-ink-2">
                  写一封新的信，换你等 TA 一次。名字已经替你换好了。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={reply}
              >
                回一罐给 {label.senderName}
                <ArrowRight size={15} />
              </button>
            </div>

            <div className="letter-actions">
              <p className="max-w-[28rem] text-[11.5px] leading-relaxed text-ink-3">
                这条链接可以再打开，随时回来重读。
              </p>
              <Link to="/" className="btn btn-quiet btn-sm">
                回首页
              </Link>
            </div>
          </section>
        </div>
      );
    }
  } else {
    const ready = phase === "ready" || phase === "opening";
    const unlock = can ? new Date(can.unlockAt) : null;
    const created = label ? new Date(label.createdAt) : null;
    const waxHolding = waxProgress > 0 && waxProgress < 1 && !waxCracked;
    const openHint = openError
      ? "蜡又合上了。再按住一次试试。"
      : waxCracked
        ? "蜡裂开了，盖子正在松开……"
        : waxHolding
          ? "别松手，蜡正在变软……"
          : "按住罐口的蜡，别松手。";

    body = (
      <div className={ready ? "can-page is-ready" : "can-page"}>
        <div className="can-page-head">
          <div className="can-intro">
            <p className="eyebrow">For {label?.recipientName ?? "你"}</p>
            <h1 className="display-sm">
              {ready ? "时间到了。" : "有一罐东西，在等你。"}
            </h1>
            <p className="body-copy max-w-[32rem]">
              {ready
                ? "它在这里等了一会儿。现在，可以把它拆开了。"
                : `封于 ${created && !Number.isNaN(created.getTime()) ? formatLongDate(created) : "某一天"}。请在 ${
                    unlock && !Number.isNaN(unlock.getTime())
                      ? formatLongDate(unlock)
                      : "那一天"
                  } 之后再来。它不会提前松开，连寄件人也不能。`}
            </p>

            {!ready && unlock && !Number.isNaN(unlock.getTime()) ? (
              <div className="countdown-wrap">
                <Countdown
                  target={unlock}
                  offsetMs={offsetMs}
                  onArrive={() =>
                    setPhase((current) =>
                      current === "sealed" ? "ready" : current,
                    )
                  }
                />
                <div className="countdown-caption">
                  <span>距离松开</span>
                  <span>
                    {formatLongDate(unlock)} {formatTime(unlock)}
                  </span>
                </div>
              </div>
            ) : null}

            {ready ? (
              <div className="w-full max-w-[30rem]">
                <p className="ready-whisper">
                  只有这一次初拆。拆开之后，信和声音会留下来，你随时可以回来重读。
                </p>
                {openError ? (
                  <div className="notice mt-4" role="alert">
                    {openError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="sealed-note max-w-[30rem]">
                蜡封还完整。时间不到，谁也不能把它拆开。
                <br />
                把这一页收好，或者等到那天再打开。
              </div>
            )}
          </div>

          <div className="can-stage">
            {can ? (
              <Tilt max={4}>
                <CanObject
                  skin={can.skin}
                  recipient={label?.recipientName}
                  sender={label?.senderName}
                  labelLine={label?.labelLine}
                  unlockAt={can.unlockAt}
                  serial={serial}
                  size="medium"
                  floating={!ready}
                  className={ready ? "can-invite" : ""}
                  waxProgress={ready ? waxProgress : undefined}
                  waxState={waxCracked ? "cracked" : "sealed"}
                  waxControl={
                    phase === "ready" ? (
                      <WaxPress
                        variant="overlay"
                        label="按住蜡封，拆开这一罐"
                        hint="按住不放，等蜡裂开。"
                        duration={1500}
                        completeSound="crack"
                        doneLabel="蜡裂开了。"
                        disabled={openingBusy}
                        resetSignal={waxReset}
                        onProgress={setWaxProgress}
                        onComplete={() => {
                          setWaxCracked(true);
                          void handleOpen();
                        }}
                      />
                    ) : undefined
                  }
                />
              </Tilt>
            ) : null}
            {ready ? (
              <p
                className={`can-open-note ${waxHolding ? "is-holding" : ""}`}
                aria-live="polite"
              >
                {openHint}
              </p>
            ) : null}
            {!ready ? (
              <div className="postmark" aria-hidden="true">
                <span>
                  DO NOT
                  <br />
                  OPEN
                  <br />
                  EARLY
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {!ready ? (
          <div className="trust-strip !mt-2">
            <div>
              <p className="eyebrow">A hard seal</p>
              <p className="mt-3 font-serif text-[1.25rem] leading-snug">
                时间没到，
                <br />
                钥匙也不管用。
              </p>
            </div>
            <ul className="trust-list">
              <li>信和声音锁好之后才离开你。连 LoveCan 也不知道里面写了什么。</li>
              <li>到期之前，寄件人自己也读不到。它只能被照看，不能被偷看。</li>
              <li>到了那天，带着这条链接回来，蜡封才会松开。</li>
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <PageShell
      right={headerRight}
      footerNote={
        phase === "letter"
          ? "这封信只在你和 TA 之间。LoveCan 不知道里面写了什么。"
          : phase === "revoked"
            ? "这一罐已经被收回。信和声音都不在了。"
            : "一封信，一段声音，一个还没到的时间。"
      }
    >
      <div className={`listening-veil ${listening ? "is-on" : ""}`} aria-hidden="true" />
      {body}

      {phase === "opening" && label ? (
        <div className="opening-veil" role="status" aria-live="polite">
          <CanObject
            skin={can?.skin ?? "spring"}
            recipient={label.recipientName}
            sender={label.senderName}
            labelLine={label.labelLine}
            unlockAt={can?.unlockAt}
            serial={serial}
            size="hero"
            opening
            floating={false}
          />
          <div>
            <p className="font-letter text-[18px] text-ink-2">
              蜡封松开了。
            </p>
            <p className="opening-caption mt-2">
              For {label.recipientName} · {serial}
            </p>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
