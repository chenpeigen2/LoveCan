import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { CanObject } from "@/components/CanObject";
import { Tilt } from "@/components/Tilt";
import { WaxPress } from "@/components/WaxPress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatLongDate } from "@/lib/date";
import { readSavedCans } from "@/lib/saved-cans";
import { playSound } from "@/lib/sound";

type DemoPhase = "sealed" | "opening" | "letter";
type DemoWax = "sealed" | "cracked";

const SAMPLE_BARS = [
  34, 58, 42, 77, 51, 88, 36, 63, 92, 47, 69, 38, 81, 55, 73, 43, 90, 60, 31,
  76, 49, 84, 39, 67, 57, 95, 45, 71, 33, 86, 52, 64, 41, 79,
];

const SAMPLE_LETTER = `亲爱的你：

写这封信的时候，窗外有风。桌上的水凉了一半，我忽然想起你上次说，秋天很短。

如果只能留下一个下午，我会留下我们一起走错路的那次。太阳快落了，你还在前面说，没关系，总会到的。

下次你一个人难过的时候，请记得：有人在很久以前，就已经替你存好了一点爱。`;

function SampleVoice() {
  return (
    <div>
      <div className="locked-voice">
        <span className="locked-voice-mark">
          <LockKeyhole size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="typewriter text-[9px] uppercase tracking-[0.13em]">
              一段留给你的声音
            </span>
            <span className="typewriter text-[9px] tracking-[0.1em] opacity-70">
              0:37
            </span>
          </div>
          <div className="locked-voice-lines" aria-hidden="true">
            {SAMPLE_BARS.map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        在真的罐子里，这里会是你自己的声音。要等到到期那天，它才会响。
      </p>
    </div>
  );
}

function SampleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [phase, setPhase] = useState<DemoPhase>("sealed");
  const [wax, setWax] = useState<DemoWax>("sealed");
  const [waxProgress, setWaxProgress] = useState(0);
  const [sampleHolding, setSampleHolding] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) return;
    setPhase("sealed");
    setWax("sealed");
    setWaxProgress(0);
    setSampleHolding(false);
    setResetSignal((value) => value + 1);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const crack = () => {
    setWax("cracked");
    setSampleHolding(false);
    setPhase("opening");
    timerRef.current = window.setTimeout(() => {
      setPhase("letter");
      playSound("chime");
      timerRef.current = null;
    }, 1050);
  };

  const again = () => {
    setPhase("sealed");
    setWax("sealed");
    setWaxProgress(0);
    setSampleHolding(false);
    setResetSignal((value) => value + 1);
  };

  const demoDate = useMemo(
    () => new Date(Date.now() + 86400000 * 180).toISOString(),
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="modal-paper sm:max-w-2xl p-0">
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-9">
          <p className="eyebrow">Sample can · 示范罐</p>
          <DialogTitle className="display-sm mt-2">
            先拆一只看看。
          </DialogTitle>
          <DialogDescription className="mt-3 text-[13.5px] leading-relaxed text-ink-2">
            这里面没有真的信，也没有人等它。真的那一罐，要等你写完、封上，交给时间。
          </DialogDescription>

          {phase !== "letter" ? (
            <div className="sample-stage flex-col gap-6">
              <CanObject
                skin="spring"
                recipient="你"
                sender="一个把话封起来的人"
                labelLine="等秋天短一点的时候"
                unlockAt={demoDate}
                size="medium"
                opening={phase === "opening"}
                waxState={wax}
                waxProgress={waxProgress}
                demo
                waxControl={
                  phase === "sealed" ? (
                    <WaxPress
                      variant="overlay"
                      label="按住蜡封，拆开示范罐"
                      duration={1000}
                      completeSound="crack"
                      doneLabel="裂开了。"
                      resetSignal={resetSignal}
                      onProgress={(value) => {
                        setWaxProgress(value);
                        setSampleHolding(value > 0 && value < 1);
                      }}
                      onComplete={crack}
                    />
                  ) : null
                }
              />
              <div className="flex flex-col items-center gap-4">
                <p className="sample-note">
                  {phase === "opening"
                    ? "蜡裂开了，盖子正在松开……"
                    : sampleHolding
                      ? "别松手，蜡正在变软……"
                      : "按住罐口的蜡，别松手。"}
                </p>
                {phase === "sealed" ? null : (
                  <p className="loading-mark">opening</p>
                )}
              </div>
            </div>
          ) : (
            <div className="letter-reveal mt-7">
              <div className="letter-sheet sample-letter">
                <div className="letter-meta">
                  <span>LoveCan · Sample</span>
                  <span>示范内容 · 不会寄出</span>
                </div>
                <p className="letter-body">{SAMPLE_LETTER}</p>
                <div className="letter-sign">
                  <span className="letter-sign-name">一个把话封起来的人</span>
                  <p className="letter-sign-date">封于今天，等一个秋天</p>
                </div>
              </div>
              <div className="mt-4">
                <SampleVoice />
              </div>
              <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                <button type="button" className="btn btn-quiet" onClick={again}>
                  再看一次
                </button>
                <Link
                  to="/write/"
                  className="btn btn-primary"
                  onClick={() => onOpenChange(false)}
                >
                  去封一罐真的
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Landing() {
  const [sampleOpen, setSampleOpen] = useState(false);
  const [heroWax, setHeroWax] = useState(0);
  const [heroReset, setHeroReset] = useState(0);
  const [saved] = useState(() => readSavedCans());
  const demoDate = useMemo(
    () => new Date(Date.now() + 86400000 * 180).toISOString(),
    [],
  );
  const calendar = useMemo(() => {
    const date = new Date(demoDate);
    return {
      day: String(date.getDate()).padStart(2, "0"),
      month: date
        .toLocaleString("en-US", { month: "short" })
        .toUpperCase(),
      year: date.getFullYear(),
    };
  }, [demoDate]);

  const closeSample = (open: boolean) => {
    setSampleOpen(open);
    if (!open) {
      setHeroWax(0);
      setHeroReset((value) => value + 1);
    }
  };

  return (
    <PageShell>
      <section className="desk-hero" aria-labelledby="desk-title">
        <div className="desk-paper">
          <span className="desk-tape desk-tape-a" aria-hidden="true" />
          <span className="desk-tape desk-tape-b" aria-hidden="true" />
          <div className="desk-paper-meta" aria-hidden="true">
            <span>TO · 以后的你</span>
            <span>FROM · 今天的我</span>
          </div>
          <p className="eyebrow">LoveCan · 爱意罐头</p>
          <h1 id="desk-title" className="display desk-title mt-4">
            把今天，
            <br />
            封进<em>以后</em>。
          </h1>
          <p className="body-copy desk-copy">
            写一封不会立刻被读到的信，录一段等到那天才响的声音。
            挑一个日子，用蜡封上。
          </p>
          <div className="desk-actions">
            <Link to="/write/" className="btn btn-wax btn-lg">
              封一罐
              <ArrowRight size={17} />
            </Link>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setSampleOpen(true)}
            >
              先拆一只看看
            </button>
          </div>
          <p className="desk-fineprint">
            不用注册。信和声音在你手里锁好，才离开这一页。钥匙只在你收到的那条链接里。
          </p>
          <p className="desk-sign" aria-hidden="true">
            — 写给一个还没到的日子
          </p>
        </div>

        <div className="desk-stage">
          <div className="postmark desk-postmark" aria-hidden="true">
            <span>
              SEALED
              <br />
              WITH
              <br />
              PATIENCE
            </span>
          </div>

          <Tilt className="desk-can" max={3.2}>
            <CanObject
              skin="spring"
              recipient="你"
              sender="我"
              labelLine="等一个春天"
              unlockAt={demoDate}
              size="hero"
              waxProgress={heroWax}
              waxControl={
                <WaxPress
                  variant="overlay"
                  label="按住蜡封，拆开示范罐"
                  duration={1000}
                  completeSound="crack"
                  doneLabel="裂开了。"
                  resetSignal={heroReset}
                  onProgress={setHeroWax}
                  onComplete={() => setSampleOpen(true)}
                />
              }
              demo
            />
          </Tilt>

          <p className="desk-can-hint" aria-hidden="true">
            按住蜡封，拆一只看看。
          </p>

          <aside className="desk-date" aria-label="一个还没到的日子">
            <span className="desk-date-pin" aria-hidden="true" />
            <span className="desk-date-month">
              {calendar.month} · {calendar.year}
            </span>
            <span className="desk-date-day">{calendar.day}</span>
            <span className="desk-date-label">到期那天</span>
            <span className="desk-date-hand" aria-hidden="true">
              还没到。
            </span>
          </aside>

          <div className="desk-voice" aria-label="一段等到期才响的声音">
            <span className="desk-voice-hole" aria-hidden="true" />
            <div className="desk-voice-head">
              <span>一段声音</span>
              <span>0:37</span>
            </div>
            <div className="desk-voice-bars" aria-hidden="true">
              {SAMPLE_BARS.slice(0, 22).map((height, index) => (
                <span key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <p className="desk-voice-foot">到期才响</p>
          </div>
        </div>
      </section>

      <section
        className="desk-manifest"
        aria-labelledby="manifest-title"
      >
        <div className="manifest-head">
          <p className="eyebrow">Inside the can</p>
          <h2 id="manifest-title" className="display-sm mt-3">
            一只罐头，
            <br />
            只有三样东西。
          </h2>
          <p className="manifest-lead">
            不提醒，不催促。到了那天，它自己在那里。
          </p>
          <div className="packing-list">
            <div className="packing-row">
              <span className="packing-num">01</span>
              <div>
                <h3 className="packing-title">一封折好的信</h3>
                <p className="packing-copy">
                  可以很长，也可以只有一句。不占消息列表，不等你回。
                </p>
              </div>
              <span className="packing-mark is-letter" aria-hidden="true" />
            </div>
            <div className="packing-row">
              <span className="packing-num">02</span>
              <div>
                <h3 className="packing-title">一段你的声音</h3>
                <p className="packing-copy">
                  最多 90 秒。到期那天，灯会暗下来，它才响。
                </p>
              </div>
              <span className="packing-mark is-voice" aria-hidden="true">
                {SAMPLE_BARS.slice(0, 7).map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </span>
            </div>
            <div className="packing-row">
              <span className="packing-num">03</span>
              <div>
                <h3 className="packing-title">一个说好的日子</h3>
                <p className="packing-copy">
                  一个月、半年，或某个你还没过到的春天。
                </p>
              </div>
              <span className="packing-mark is-date" aria-hidden="true">
                {calendar.day}
              </span>
            </div>
          </div>
        </div>

        <aside className="custody-slip" aria-labelledby="custody-title">
          <span className="custody-stamp" aria-hidden="true">
            已上锁
          </span>
          <p className="eyebrow">Custody note · 寄存单</p>
          <h2 id="custody-title" className="custody-title">
            罐子在我们这里，
            <br />
            钥匙不在。
          </h2>
          <ul className="custody-list">
            <li>信和声音锁好之后，才交到 LoveCan 手里。</li>
            <li>钥匙跟着链接走，LoveCan 不替任何人保管。</li>
            <li>时间不到，罐子不会松开。寄件人也不行。</li>
            <li>照看它的那条链接只属于你。丢了它，没人能替你收回这只罐子。</li>
          </ul>
          <div className="custody-foot" aria-hidden="true">
            <span>LoveCan custody · No. 000001</span>
            <span>no account needed</span>
          </div>
        </aside>
      </section>

      {saved.length > 0 ? (
        <section className="desk-shelf" aria-labelledby="shelf-title">
          <div className="section-head !py-0">
            <div>
              <p className="eyebrow">On this device</p>
              <h2 id="shelf-title" className="display-sm mt-3">
                你封过的罐子。
              </h2>
            </div>
            <p className="max-w-[22rem] text-[12px] leading-relaxed text-ink-3">
              只记在这台设备上。真正作数的，是你打印下来的那张卡。
            </p>
          </div>
          <div className="saved-tags">
            {saved.slice(0, 4).map((item) => {
              const date = new Date(item.unlockAt);
              return (
                <div key={item.id} className="saved-tag">
                  <span className="saved-tag-wax" aria-hidden="true">
                    L
                  </span>
                  <div className="saved-tag-body">
                    <p className="saved-tag-name">给 {item.recipient}</p>
                    <p className="saved-tag-date">
                      {Number.isNaN(date.getTime())
                        ? "某一天到期"
                        : `${formatLongDate(date)} 到期`}
                    </p>
                  </div>
                  <a href={item.manageUrl} className="saved-tag-link">
                    去照看
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="desk-closing">
        <p className="eyebrow">Before you go</p>
        <h2 className="display-sm">
          今天想说的话，
          <br />
          不必今天就说完。
        </h2>
        <Link to="/write/" className="btn btn-wax btn-lg">
          封下第一罐
          <ArrowRight size={17} />
        </Link>
        <p className="desk-closing-note">
          封好之后，你会拿到两条链接：一条给 TA，一条留给自己。
        </p>
      </section>

      <SampleDialog open={sampleOpen} onOpenChange={closeSample} />
    </PageShell>
  );
}
