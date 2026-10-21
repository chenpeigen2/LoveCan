import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { CanObject } from "@/components/CanObject";
import { DateComposer } from "@/components/DateComposer";
import { Tilt } from "@/components/Tilt";
import { VoiceNote } from "@/components/VoiceNote";
import { WaxPress } from "@/components/WaxPress";
import { useRecorder, blobToBase64, formatDuration } from "@/lib/audio";
import {
  DATE_PRESETS,
  MIN_UNLOCK_SECONDS,
  SEASON_NAMES,
  defaultLabelLine,
  formatLongDate,
  formatTime,
  labelSuggestions,
  maxUnlockDate,
  presetDate,
  seasonOf,
  validateUnlockAt,
  type DatePreset,
} from "@/lib/date";
import {
  MAX_LABEL_LINE,
  MAX_LETTER,
  MAX_RECIPIENT_NAME,
  MAX_SENDER_NAME,
  MAX_VOICE_SECONDS,
  SKINS,
  WRITING_PROMPTS,
  suggestLabelLine,
  type Skin,
} from "@/lib/prompts";
import {
  AAD_CONTENT,
  AAD_LABEL,
  contentDigest,
  cryptoAvailable,
  deriveOpenToken,
  encryptJson,
  randomCanId,
  randomToken,
  sha256Hex,
  type AudioPayload,
  type ContentPayload,
  type LabelPayload,
} from "@/lib/crypto";
import { buildManageUrl, buildShareUrl } from "@/lib/links";
import { ApiError, apiErrorMessage, createCan } from "@/lib/api";
import { playSound } from "@/lib/sound";
import { saveSealResult } from "@/lib/seal-result";
import { saveSealedCan } from "@/lib/saved-cans";

type Step = 1 | 2 | 3 | 4 | 5;

interface ReplyState {
  senderName?: string;
  recipientName?: string;
  labelLine?: string;
}

const STEP_COPY: Record<Step, { title: string; copy: string }> = {
  1: {
    title: "先写下两个名字。",
    copy: "一个会被印在腰封上，一个会签在信末。",
  },
  2: {
    title: "把想说的话，留给以后。",
    copy: "不必像信。一段话、一件小事，或者一句一直没说出口的话。",
  },
  3: {
    title: "留下一点你的声音。",
    copy: "九十秒以内。等到那天，它才会响。",
  },
  4: {
    title: "选一个日子，挑一只罐子。",
    copy: "日子到了，罐子才会松开。",
  },
  5: {
    title: "再看一眼，然后封上。",
    copy: "蜡凉下来以后，这只罐子就不属于现在了。",
  },
};

const STEP_NAMES = ["名字", "信", "声音", "日子", "封罐"];

const SEAL_MESSAGES = [
  "把信折好……",
  "留住你的声音……",
  "熔开一滴蜡……",
  "等蜡变凉……",
];

export function Write() {
  const navigate = useNavigate();
  const location = useLocation();
  const replyState = (location.state ?? null) as ReplyState | null;

  const [step, setStep] = useState<Step>(1);
  const [senderName, setSenderName] = useState(replyState?.senderName ?? "");
  const [recipientName, setRecipientName] = useState(
    replyState?.recipientName ?? "",
  );
  const [letter, setLetter] = useState("");
  const [dateMode, setDateMode] = useState<DatePreset>("oneMonth");
  const [customAt, setCustomAt] = useState(() => {
    const next = presetDate("oneMonth");
    next.setHours(20, 0, 0, 0);
    return next;
  });
  const [skin, setSkin] = useState<Skin>("spring");
  const [labelLine, setLabelLine] = useState(replyState?.labelLine ?? "");
  const [labelTouched, setLabelTouched] = useState(
    Boolean(replyState?.labelLine),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sealing, setSealing] = useState(false);
  const [sealStage, setSealStage] = useState(0);
  const [sealDone, setSealDone] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [waxProgress, setWaxProgress] = useState(0);
  const [sealReset, setSealReset] = useState(0);

  const recorder = useRecorder();
  const letterRef = useRef<HTMLTextAreaElement | null>(null);
  const sealingRef = useRef(false);
  const sealTimerRef = useRef<number | null>(null);
  const stageTimerRef = useRef<number | null>(null);
  const navigateTimerRef = useRef<number | null>(null);

  const selectedDate = useMemo(() => {
    if (dateMode === "custom") return customAt;
    return presetDate(dateMode);
  }, [dateMode, customAt]);

  const previewUnlock = selectedDate.toISOString();
  const labelMoment = selectedDate;
  const labelSeason = SEASON_NAMES[seasonOf(labelMoment)];
  const labelIdeas = labelSuggestions(labelMoment);
  const autoLabelLine = defaultLabelLine(labelMoment);
  const clip = recorder.clip;

  useEffect(() => {
    if (labelTouched) return;
    setLabelLine(suggestLabelLine(selectedDate));
  }, [selectedDate, labelTouched]);

  useEffect(() => {
    if (step === 3) return;
    if (recorder.status === "recording") recorder.stop();
    if (recorder.status === "requesting") recorder.reset();
  }, [step, recorder.status, recorder.stop, recorder.reset]);

  useEffect(() => {
    const dirty = Boolean(
      senderName || recipientName || letter || clip || labelTouched,
    );
    if (!dirty || sealing) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [senderName, recipientName, letter, clip, labelTouched, sealing]);

  useEffect(() => {
    return () => {
      if (sealTimerRef.current !== null) window.clearInterval(sealTimerRef.current);
      if (stageTimerRef.current !== null) window.clearTimeout(stageTimerRef.current);
      if (navigateTimerRef.current !== null) window.clearTimeout(navigateTimerRef.current);
    };
  }, []);

  const clearError = (key: string) => {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const resetLabelLine = () => {
    playSound("tap");
    setLabelTouched(false);
  };

  const pickLabelLine = (line: string) => {
    playSound("tap");
    setLabelLine(line);
    setLabelTouched(true);
    clearError("labelLine");
  };

  const appendPrompt = (prompt: string) => {
    playSound("paper");
    setLetter((current) => {
      const base = current.replace(/\s*$/, "");
      const next = base ? `${base}\n\n${prompt}` : prompt;
      return next.slice(0, MAX_LETTER);
    });
    clearError("letter");
    window.requestAnimationFrame(() => {
      const element = letterRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });
  };

  const validateCurrent = (): boolean => {
    const next: Record<string, string> = {};
    const sender = senderName.trim();
    const recipient = recipientName.trim();

    if (step === 1) {
      if (!recipient) next.recipient = "给谁写呢？写下 TA 的名字。";
      else if (recipient.length > MAX_RECIPIENT_NAME) {
        next.recipient = `名字最多 ${MAX_RECIPIENT_NAME} 个字。`;
      }
      if (!sender) next.sender = "也留下你的名字吧。";
      else if (sender.length > MAX_SENDER_NAME) {
        next.sender = `名字最多 ${MAX_SENDER_NAME} 个字。`;
      }
    }

    if (step === 2) {
      if (!letter.trim()) next.letter = "信还是空的。哪怕只写一句。";
      else if (letter.length > MAX_LETTER) {
        next.letter = `信最多 ${MAX_LETTER} 个字。`;
      }
    }

    if (step === 3) {
      if (recorder.status === "recording" || recorder.status === "requesting") {
        next.voice = "先把录音停下来。";
      }
    }

    if (step === 4) {
      if (!selectedDate) next.date = "还没选好日子。";
      else {
        const message = validateUnlockAt(selectedDate);
        if (message) next.date = message;
      }
      if (labelLine.trim().length > MAX_LABEL_LINE) {
        next.labelLine = `腰封上的话最多 ${MAX_LABEL_LINE} 个字。`;
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (sealing) return;
    if (!validateCurrent()) return;
    playSound("paper");
    setStep((step + 1) as Step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goBack = () => {
    if (sealing) return;
    if (step === 1) {
      navigate("/");
      return;
    }
    playSound("paper");
    setStep((step - 1) as Step);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const seal = async () => {
    if (sealingRef.current) return;
    const resetPress = () => {
      setWaxProgress(0);
      setSealReset((value) => value + 1);
    };
    if (!validateCurrent()) {
      resetPress();
      return;
    }

    const target = selectedDate;
    if (!target) {
      setErrors({ date: "还没选好日子。" });
      resetPress();
      return;
    }
    const targetMessage = validateUnlockAt(target);
    if (targetMessage) {
      setErrors({ date: targetMessage });
      resetPress();
      return;
    }
    if (!cryptoAvailable()) {
      setSealError(apiErrorMessage("crypto_unavailable"));
      resetPress();
      return;
    }
    if (recorder.status === "recording" || recorder.status === "requesting") {
      setErrors({ voice: "先把录音停下来。" });
      resetPress();
      return;
    }

    sealingRef.current = true;
    setSealError(null);
    setSealDone(false);
    setSealStage(0);
    setSealing(true);

    if (sealTimerRef.current !== null) window.clearInterval(sealTimerRef.current);
    sealTimerRef.current = window.setInterval(() => {
      setSealStage((current) => Math.min(current + 1, SEAL_MESSAGES.length - 1));
    }, 1100);

    try {
      const createdAt = new Date().toISOString();
      const unlockAt = target.toISOString();
      const finalSender = senderName.trim().slice(0, MAX_SENDER_NAME);
      const finalRecipient = recipientName
        .trim()
        .slice(0, MAX_RECIPIENT_NAME);
      const finalLine =
        labelLine.trim().slice(0, MAX_LABEL_LINE) || defaultLabelLine(target);
      const finalLetter = letter.trim().slice(0, MAX_LETTER);

      let audio: AudioPayload | null = null;
      if (clip) {
        audio = {
          mime: clip.mime,
          base64: await blobToBase64(clip.blob),
          duration: Math.min(MAX_VOICE_SECONDS, clip.duration),
        };
      }

      const key = randomToken();
      const ownerToken = randomToken();
      const openToken = await deriveOpenToken(key);
      const ownerHash = await sha256Hex(ownerToken);
      const openHash = await sha256Hex(openToken);
      const id = randomCanId();

      const labelPayload: LabelPayload = {
        v: 1,
        senderName: finalSender,
        recipientName: finalRecipient,
        labelLine: finalLine,
        createdAt,
      };
      const contentPayload: ContentPayload = {
        v: 1,
        letter: finalLetter,
        audio,
      };

      const labelCiphertext = await encryptJson(key, labelPayload, AAD_LABEL);
      const contentCiphertext = await encryptJson(
        key,
        contentPayload,
        AAD_CONTENT,
      );
      const requestHash = await contentDigest([
        id,
        labelCiphertext,
        contentCiphertext,
        unlockAt,
        skin,
        ownerHash,
        openHash,
      ]);

      await createCan({
        id,
        labelCiphertext,
        contentCiphertext,
        unlockAt,
        skin,
        ownerHash,
        openHash,
        requestHash,
      });

      if (sealTimerRef.current !== null) {
        window.clearInterval(sealTimerRef.current);
        sealTimerRef.current = null;
      }
      setSealStage(SEAL_MESSAGES.length);
      setSealDone(true);

      const shareUrl = buildShareUrl(window.location.origin, id, key);
      const manageUrl = buildManageUrl(
        window.location.origin,
        id,
        ownerToken,
        key,
      );

      saveSealResult({
        id,
        shareUrl,
        manageUrl,
        sender: finalSender,
        recipient: finalRecipient,
        labelLine: finalLine,
        unlockAt,
        createdAt,
        skin,
      });
      saveSealedCan({
        id,
        recipient: finalRecipient,
        unlockAt,
        createdAt,
        manageUrl,
        sender: finalSender,
        labelLine: finalLine,
        skin,
      });

      navigateTimerRef.current = window.setTimeout(() => {
        navigate(`/sent/${id}/`, { replace: true });
      }, 1100);
    } catch (caught) {
      if (sealTimerRef.current !== null) {
        window.clearInterval(sealTimerRef.current);
        sealTimerRef.current = null;
      }
      sealingRef.current = false;
      setSealing(false);
      setSealDone(false);
      setWaxProgress(0);
      setSealReset((value) => value + 1);
      const code = caught instanceof ApiError ? caught.code : "unknown";
      setSealError(apiErrorMessage(code));
    }
  };

  const stepCopy = STEP_COPY[step];
  const canSerial = "DRAFT";
  const shortDate = (date: Date) =>
    formatLongDate(date).replace(/^\d{4} 年 /, "");
  const now = new Date();
  const unlockMin = new Date(now.getTime() + MIN_UNLOCK_SECONDS * 1000);
  unlockMin.setSeconds(0, 0);
  if (unlockMin.getTime() < now.getTime() + MIN_UNLOCK_SECONDS * 1000) {
    unlockMin.setMinutes(unlockMin.getMinutes() + 1);
  }
  const unlockMax = maxUnlockDate(now);
  const previewDay = String(selectedDate.getDate()).padStart(2, "0");
  const previewMonth = selectedDate
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();

  return (
    <PageShell
      right={
        <span className="header-note">
          Step 0{step} / 05
        </span>
      }
      footerNote="写完、封上，然后交给时间。"
    >
      {replyState ? (
        <div className="notice mt-6">
          这是给 <strong>{replyState.senderName || "TA"}</strong> 的一罐回信。
          名字已经替你换好了，你可以直接往下写。
        </div>
      ) : null}

      <div className="write-grid">
        <div className="write-stage">
          {step < 5 ? (
            <div className="write-mini">
              <div className="write-mini-can">
                <CanObject
                  skin={skin}
                  recipient={recipientName.trim()}
                  sender={senderName.trim()}
                  labelLine={labelLine.trim()}
                  unlockAt={previewUnlock}
                  serial={canSerial}
                  size="mini"
                  floating={false}
                />
              </div>
              <div className="write-mini-body">
                <span className="write-mini-to">
                  给 {recipientName.trim() || "还没写名字"}
                </span>
                <span className="write-mini-meta">
                  {selectedDate ? formatLongDate(selectedDate) : "还没选日子"}
                  {clip ? ` · ${formatDuration(clip.duration)} 声音` : ""}
                </span>
              </div>
              <span className="write-mini-step">0{step} / 05</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="progress-track w-full max-w-[440px]">
              {[1, 2, 3, 4, 5].map((value) => (
                <span
                  key={value}
                  className={`progress-seg ${
                    value < step ? "is-done" : value === step ? "is-current" : ""
                  }`}
                />
              ))}
            </div>
            <span className="serial">约 5 分钟</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {STEP_NAMES.map((name, index) => {
              const value = (index + 1) as Step;
              return (
                <span
                  key={name}
                  className={`typewriter text-[9px] uppercase tracking-[0.12em] ${
                    value === step ? "text-ink" : "text-ink-3/70"
                  }`}
                  aria-current={value === step ? "step" : undefined}
                >
                  {String(value).padStart(2, "0")} {name}
                </span>
              );
            })}
          </div>

          <h1 className="step-title">{stepCopy.title}</h1>
          <p className="step-copy">{stepCopy.copy}</p>

          <div className="step-body">
            {step === 1 ? (
              <div>
                <div className="object-paper name-object">
                  <span className="object-tape object-tape-a" aria-hidden="true" />
                  <div className="object-head">
                    <span className="object-label">Two names · 两个名字</span>
                    <span className="object-note">收件人的名字会印在腰封上。</span>
                  </div>
                  <div className="field-grid two name-slips">
                    <label className="field name-slip is-to">
                      <span className="field-label">收件人 · To</span>
                      <input
                        className="field-input"
                        value={recipientName}
                        maxLength={MAX_RECIPIENT_NAME}
                        placeholder="TA 的名字"
                        autoComplete="off"
                        onChange={(event) => {
                          setRecipientName(event.target.value);
                          clearError("recipient");
                        }}
                        aria-invalid={Boolean(errors.recipient)}
                      />
                      <span className="counter-row">
                        <span>会印在腰封上</span>
                        <span>
                          {recipientName.length} / {MAX_RECIPIENT_NAME}
                        </span>
                      </span>
                      {errors.recipient ? (
                        <span className="field-error">{errors.recipient}</span>
                      ) : null}
                    </label>

                    <label className="field name-slip is-from">
                      <span className="field-label">寄件人 · From</span>
                      <input
                        className="field-input"
                        value={senderName}
                        maxLength={MAX_SENDER_NAME}
                        placeholder="你的名字"
                        autoComplete="off"
                        onChange={(event) => {
                          setSenderName(event.target.value);
                          clearError("sender");
                        }}
                        aria-invalid={Boolean(errors.sender)}
                      />
                      <span className="counter-row">
                        <span>会签在信的末尾</span>
                        <span>
                          {senderName.length} / {MAX_SENDER_NAME}
                        </span>
                      </span>
                      {errors.sender ? (
                        <span className="field-error">{errors.sender}</span>
                      ) : null}
                    </label>
                  </div>
                </div>

                <div className="notice notice-neutral mt-8">
                  它不会出现在任何消息列表里。只会在你选的那天，安静地等在一条链接后面。
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <div className="letter-object">
                  <span
                    className="object-tape object-tape-b"
                    aria-hidden="true"
                  />
                  <div className="letter-object-head">
                    <span className="object-label">Letter · 一封信</span>
                    <span className="counter-row">
                      封于今天 · {letter.length} / {MAX_LETTER}
                    </span>
                  </div>
                  <textarea
                    ref={letterRef}
                    className="letter-input mt-3"
                    value={letter}
                    maxLength={MAX_LETTER}
                    placeholder={`写给 ${
                      recipientName.trim() || "你"
                    }。\n\n从今天写起。比如：窗外的风很好，我忽然想起你……`}
                    onChange={(event) => {
                      setLetter(event.target.value);
                      clearError("letter");
                    }}
                    aria-invalid={Boolean(errors.letter)}
                    aria-label="信的内容"
                  />
                  {errors.letter ? (
                    <p className="field-error mt-2">{errors.letter}</p>
                  ) : null}
                  <p className="letter-object-foot">
                    写给 {recipientName.trim() || "你"}，会在到期那天被读到。
                  </p>
                </div>

                <div className="prompt-object mt-4">
                  <p className="field-hint">
                    不知道从哪里开始？点一句，把它放在信的末尾，然后接着写。
                  </p>
                  <div className="prompt-row">
                    {WRITING_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="prompt-chip"
                        onClick={() => appendPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div>
                <div className="recorder-object">
                  <div className="recorder-object-head">
                    <span className="object-label">Voice memo · 一段声音</span>
                    <span
                      className={`recorder-led ${
                        recorder.status === "recording" ? "is-on" : ""
                      }`}
                    >
                      {recorder.status === "recording" ? "REC" : "90 SEC"}
                    </span>
                  </div>
                  <div className="recorder">
                  {recorder.status === "recorded" && clip ? (
                    <div className="w-full">
                      <VoiceNote
                        src={clip.url}
                        duration={clip.duration}
                        label="你刚刚留下的声音"
                      />
                      <div className="mt-4 flex flex-wrap justify-center gap-3">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={recorder.reset}
                        >
                          <RotateCcw size={14} />
                          重新录一段
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={recorder.reset}
                        >
                          <Trash2 size={14} />
                          不要这段声音
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`record-button ${
                          recorder.status === "recording" ? "is-recording" : ""
                        }`}
                        onClick={() => {
                          if (recorder.status === "recording") recorder.stop();
                          else void recorder.start();
                        }}
                        disabled={recorder.status === "requesting"}
                        aria-label={
                          recorder.status === "recording"
                            ? "停止录音"
                            : "开始录音"
                        }
                      >
                        {recorder.status === "recording" ? (
                          <span className="record-square" />
                        ) : (
                          <Mic size={26} />
                        )}
                      </button>

                      {recorder.status === "recording" ? (
                        <>
                          <p className="record-time">
                            {formatDuration(recorder.elapsed)}
                          </p>
                          <div className="record-wave" aria-hidden="true">
                            {Array.from({ length: 24 }).map((_, index) => (
                              <span
                                key={index}
                                style={{
                                  height: `${8 + ((index * 13) % 26)}px`,
                                  animationDelay: `${(index % 7) * 90}ms`,
                                }}
                              />
                            ))}
                          </div>
                          <p className="field-hint">
                            正在录。再按一下停下。最长 {MAX_VOICE_SECONDS} 秒。
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="font-letter text-[1.15rem] text-ink-2">
                            {recorder.status === "requesting"
                              ? "正在等麦克风……"
                              : "按下，说一段只有 TA 会听到的话。"}
                          </p>
                          <p className="field-hint">
                            最长 {MAX_VOICE_SECONDS} 秒。LoveCan 不会听，也不会把它变成文字。
                          </p>
                        </>
                      )}
                    </>
                  )}
                </div>

                {recorder.error ? (
                  <div className="notice mt-4" role="alert">
                    {recorder.error}
                  </div>
                ) : null}
                {!recorder.supported ? (
                  <div className="notice mt-4">
                    {recorder.wechat
                      ? "微信里可能录不了音。点右上角，在浏览器里打开，或者只写一封信。"
                      : "这一页不能录音。这一罐可以只装信。"}
                  </div>
                ) : null}
                {errors.voice ? (
                  <p className="field-error mt-3">{errors.voice}</p>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    不录也可以。这一罐就只装信。
                  </p>
                  {clip ? (
                    <span className="status-stamp">Voice · {formatDuration(clip.duration)}</span>
                  ) : (
                    <span className="status-stamp is-muted">Letter only</span>
                  )}
                </div>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <div className="date-object">
                  <div className="date-object-head">
                    <div>
                      <p className="field-label">到期日 · Open on</p>
                      <p className="date-object-note">
                        到了那天，它才松开。
                      </p>
                    </div>
                    <div className="date-slip-preview" aria-hidden="true">
                      <span className="date-slip-month">{previewMonth}</span>
                      <span className="date-slip-day">{previewDay}</span>
                      <span className="date-slip-label">
                        {dateMode === "custom"
                          ? formatTime(selectedDate)
                          : "OPEN ON"}
                      </span>
                    </div>
                  </div>
                  <div className="date-grid mt-4">
                    {DATE_PRESETS.map((preset) => {
                      const presetAt = presetDate(preset.id);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={`choice ${
                            dateMode === preset.id ? "is-selected" : ""
                          }`}
                          onClick={() => {
                            playSound("tap");
                            setDateMode(preset.id);
                            clearError("date");
                          }}
                          aria-pressed={dateMode === preset.id}
                        >
                          <span className="choice-body">
                            <span className="choice-title">
                              {preset.label}
                            </span>
                            <span className="choice-hint">{preset.hint}</span>
                          </span>
                          <span className="choice-meta">
                            {shortDate(presetAt)}
                          </span>
                          <span className="choice-mark" />
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`choice ${
                        dateMode === "custom" ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        playSound("tap");
                        if (dateMode !== "custom") setCustomAt(selectedDate);
                        setDateMode("custom");
                        clearError("date");
                      }}
                      aria-pressed={dateMode === "custom"}
                    >
                      <span className="choice-body">
                        <span className="choice-title">自己挑一天</span>
                        <span className="choice-hint">精确到分钟</span>
                      </span>
                      <span className="choice-meta">
                        {dateMode === "custom"
                          ? `${shortDate(customAt)} · ${formatTime(customAt)}`
                          : "CUSTOM"}
                      </span>
                      <span className="choice-mark" />
                    </button>
                  </div>

                  {dateMode === "custom" ? (
                    <div className="custom-date">
                      <DateComposer
                        value={customAt}
                        min={unlockMin}
                        max={unlockMax}
                        onChange={(next) => {
                          setCustomAt(next);
                          clearError("date");
                        }}
                      />
                    </div>
                  ) : null}

                  <p className="field-hint mt-2">
                    最早只能选一分钟以后。到了那天，随时可以拆，不必卡在那一秒。
                  </p>
                  {errors.date ? (
                    <p className="field-error mt-2">{errors.date}</p>
                  ) : null}
                </div>

                <div className="mt-9">
                  <p className="field-label">罐子 · The can</p>
                  <div className="skin-grid mt-3">
                    {SKINS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`skin-card ${
                          skin === item.id ? "is-selected" : ""
                        }`}
                        onClick={() => {
                          playSound("tap");
                          setSkin(item.id);
                        }}
                        aria-pressed={skin === item.id}
                      >
                        <span
                          className="skin-swatch"
                          style={
                            {
                              "--swatch-bg": item.bg,
                              "--swatch-label": item.label,
                              "--swatch-wax": item.wax,
                            } as CSSProperties
                          }
                        />
                        <span className="skin-name">{item.name}</span>
                        <span className="skin-line">{item.line}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-9">
                  <div className="field">
                    <div className="field-label-row">
                      <label className="field-label" htmlFor="label-line">
                        腰封上的一句话 · Label
                      </label>
                      {labelTouched ? (
                        <button
                          type="button"
                          className="label-season is-action"
                          onClick={resetLabelLine}
                        >
                          换回自动
                        </button>
                      ) : (
                        <span className="label-season">
                          {labelSeason} · 按日子自动写好
                        </span>
                      )}
                    </div>
                    <input
                      id="label-line"
                      className="field-input"
                      value={labelLine}
                      maxLength={MAX_LABEL_LINE}
                      placeholder={autoLabelLine}
                      onChange={(event) => {
                        setLabelLine(event.target.value);
                        setLabelTouched(true);
                        clearError("labelLine");
                      }}
                      aria-invalid={Boolean(errors.labelLine)}
                    />
                    <span className="counter-row">
                      <span>会手写在收件人名字下面</span>
                      <span>
                        {labelLine.length} / {MAX_LABEL_LINE}
                      </span>
                    </span>
                    <div className="label-ideas">
                      <span className="label-ideas-note">
                        也可以自己改。想换一句，点一个——
                      </span>
                      <div className="prompt-row">
                        {labelIdeas.map((idea) => (
                          <button
                            key={idea}
                            type="button"
                            className={`prompt-chip ${
                              labelLine === idea ? "is-picked" : ""
                            }`}
                            onClick={() => pickLabelLine(idea)}
                            aria-pressed={labelLine === idea}
                          >
                            {idea}
                          </button>
                        ))}
                      </div>
                    </div>
                    {errors.labelLine ? (
                      <span className="field-error">{errors.labelLine}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="review-object">
                <span className="object-tape review-tape" aria-hidden="true" />
                <div className="object-head">
                  <span className="object-label">05 · 最后一页</span>
                  <span className="object-note">看过之后，就交给蜡了。</span>
                </div>

                <div className="review-body">
                  <div className="review-can">
                    <Tilt max={3}>
                      <CanObject
                        skin={skin}
                        recipient={recipientName.trim()}
                        sender={senderName.trim()}
                        labelLine={
                          labelLine.trim() ||
                          defaultLabelLine(selectedDate ?? new Date())
                        }
                        unlockAt={previewUnlock}
                        size="medium"
                        floating={false}
                        waxProgress={waxProgress}
                      />
                    </Tilt>
                  </div>

                  <div className="review-copy">
                    <p className="review-to">给 {recipientName.trim()}，</p>
                    <p className="review-when">
                      在 {selectedDate ? formatLongDate(selectedDate) : "某一天"}。
                    </p>
                    <p className="review-meta">
                      {selectedDate ? formatTime(selectedDate) : "00:00"}{" "}
                      之后可以拆。
                      {clip
                        ? ` 里面还有一段 ${formatDuration(clip.duration)} 的声音。`
                        : " 这一罐只装了一封信。"}
                    </p>

                    <div className="review-letter scrollbar-thin">
                      <p className="font-letter text-[15px] leading-[2] text-ink-2">
                        {letter.trim().slice(0, 420)}
                        {letter.trim().length > 420 ? "……" : ""}
                      </p>
                    </div>
                    {clip ? (
                      <div className="mt-4">
                        <VoiceNote
                          src={clip.url}
                          duration={clip.duration}
                          label="留给 TA 的声音"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="review-fineprint">
                  <p>封上之后，连你也打不开。</p>
                  <p>
                    到期之前，你可以用只属于你的那条链接把它收回；收回以后，
                    信和声音一起消失，只剩一只空罐子。
                  </p>
                </div>

                {sealError ? (
                  <div className="notice mt-4" role="alert">
                    {sealError}
                  </div>
                ) : null}

                <div className="seal-press">
                  <WaxPress
                    label="按住，封上这一罐"
                    hint="按住不放，等蜡变软、压印。"
                    duration={1400}
                    completeSound="stamp"
                    doneLabel="封好了。"
                    resetSignal={sealReset}
                    onProgress={setWaxProgress}
                    onComplete={() => void seal()}
                    disabled={sealing}
                  />
                  <span className="seal-press-note">
                    松手会重来。蜡一凉，这只罐子就不属于现在了。
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="write-actions">
            <button type="button" className="btn btn-quiet" onClick={goBack}>
              <ArrowLeft size={15} />
              {step === 1 ? "回首页" : "上一步"}
            </button>
            <div className="write-actions-right">
              {step === 3 && !clip ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    if (recorder.status === "recording") {
                      setErrors({ voice: "先把录音停下来。" });
                      return;
                    }
                    setErrors({});
                    setStep(4);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  只放一封信，继续
                </button>
              ) : null}
              {step < 5 ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={goNext}
                  disabled={sealing}
                >
                  继续
                  <ArrowRight size={16} />
                </button>
              ) : (
                <span className="write-actions-note">
                  {sealing ? "正在封罐……" : "按住上面的蜡，才算封上。"}
                </span>
              )}
            </div>
          </div>
        </div>

        <aside className="write-preview hidden lg:grid" aria-label="罐子预览">
          <CanObject
            skin={skin}
            recipient={recipientName.trim()}
            sender={senderName.trim()}
            labelLine={labelLine.trim()}
            unlockAt={previewUnlock}
            serial={canSerial}
            size="medium"
          />
          <div className="write-preview-meta">
            <div className="flex items-baseline justify-between gap-4">
              <span>To</span>
              <span className="font-letter text-[14px] normal-case tracking-normal text-ink-2">
                {recipientName.trim() || "还没有名字"}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-4">
              <span>From</span>
              <span className="font-letter text-[14px] normal-case tracking-normal text-ink-2">
                {senderName.trim() || "还没有名字"}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-4">
              <span>Open on</span>
              <span className="font-letter text-[14px] normal-case tracking-normal text-ink-2">
                {selectedDate ? formatLongDate(selectedDate) : "还没有选"}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-4">
              <span>Inside</span>
              <span className="font-letter text-[14px] normal-case tracking-normal text-ink-2">
                {letter.trim() ? "一封信" : "还没有信"}
                {clip ? ` · 一段 ${formatDuration(clip.duration)} 的声音` : ""}
              </span>
            </div>
          </div>
        </aside>
      </div>

      {sealing ? (
        <div className="seal-overlay" role="status" aria-live="polite">
          <CanObject
            skin={skin}
            recipient={recipientName.trim()}
            sender={senderName.trim()}
            labelLine={labelLine.trim() || defaultLabelLine(selectedDate ?? new Date())}
            unlockAt={previewUnlock}
            size="medium"
            floating={!sealDone}
          />
          <p className="seal-stage">
            {sealDone ? (
              <strong>封好了。</strong>
            ) : (
              SEAL_MESSAGES[Math.min(sealStage, SEAL_MESSAGES.length - 1)]
            )}
          </p>
          <div className="seal-steps" aria-hidden="true">
            {SEAL_MESSAGES.map((_, index) => (
              <span
                key={index}
                className={index < Math.min(sealStage + (sealDone ? 1 : 0), 4) ? "is-done" : ""}
              />
            ))}
          </div>
          <p className="eyebrow">
            {sealDone ? "Taking it to later" : "Sealing the can"}
          </p>
        </div>
      ) : null}
    </PageShell>
  );
}
