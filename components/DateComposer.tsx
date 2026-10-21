import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { pad2 } from "@/lib/date";
import { playSound } from "@/lib/sound";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

function clampDate(value: Date, min: Date, max: Date) {
  if (value.getTime() < min.getTime()) return new Date(min);
  if (value.getTime() > max.getTime()) return new Date(max);
  return value;
}

function withTime(base: Date, hours: number, minutes: number) {
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function withDay(base: Date, day: Date) {
  const next = new Date(base);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next;
}

interface DateComposerProps {
  value: Date;
  min: Date;
  max: Date;
  onChange: (value: Date) => void;
}

interface TimeColumnProps {
  label: string;
  values: number[];
  selected: number;
  isDisabled: (value: number) => boolean;
  onPick: (value: number) => void;
}

function TimeColumn({
  label,
  values,
  selected,
  isDisabled,
  onPick,
}: TimeColumnProps) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !option) return;
    const top =
      option.offsetTop - list.clientHeight / 2 + option.offsetHeight / 2;
    list.scrollTop = Math.max(0, top);
  }, [selected]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const modal = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!modal.includes(event.key)) return;
    event.preventDefault();
    let index = values.indexOf(selected);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = values.length - 1;
    else {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      do {
        index += direction;
      } while (index >= 0 && index < values.length && isDisabled(values[index]));
    }
    if (index >= 0 && index < values.length && !isDisabled(values[index])) {
      onPick(values[index]);
    }
  };

  return (
    <div className="time-column">
      <span className="time-column-label">{label}</span>
      <div
        ref={listRef}
        className="time-options"
        role="listbox"
        aria-label={`选择${label}`}
        tabIndex={0}
        aria-activedescendant={`${id}-${selected}`}
        onKeyDown={handleKeyDown}
      >
        {values.map((item) => {
          const disabled = isDisabled(item);
          const active = item === selected;
          return (
            <div
              key={item}
              id={`${id}-${item}`}
              role="option"
              aria-selected={active}
              aria-disabled={disabled}
              className={`time-option${active ? " is-selected" : ""}${
                disabled ? " is-disabled" : ""
              }`}
              onClick={() => {
                if (disabled) return;
                playSound("tap");
                onPick(item);
              }}
            >
              {pad2(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DateComposer({ value, min, max, onChange }: DateComposerProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(value));
  const monthKey = value.getFullYear() * 12 + value.getMonth();
  const lastMonthKey = useRef(monthKey);

  useEffect(() => {
    if (lastMonthKey.current === monthKey) return;
    lastMonthKey.current = monthKey;
    setCursor(startOfMonth(value));
  }, [monthKey, value]);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const pad = (first.getDay() + 6) % 7;
    const total = getDaysInMonth(cursor);
    const cells: (Date | null)[] = Array.from({ length: pad }, () => null);
    for (let day = 1; day <= total; day += 1) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  const minDay = startOfDay(min);
  const maxDay = startOfDay(max);
  const isDayDisabled = (day: Date) =>
    isBefore(day, minDay) || isAfter(day, maxDay);

  const prevDisabled = !isAfter(cursor, startOfMonth(min));
  const nextDisabled = !isBefore(cursor, startOfMonth(max));

  const pickDay = (day: Date) => {
    if (isDayDisabled(day)) return;
    playSound("paper");
    onChange(clampDate(withDay(value, day), min, max));
  };

  const pickHour = (hour: number) => {
    playSound("tap");
    onChange(clampDate(withTime(value, hour, value.getMinutes()), min, max));
  };

  const pickMinute = (minute: number) => {
    playSound("tap");
    onChange(clampDate(withTime(value, value.getHours(), minute), min, max));
  };

  const hourDisabled = (hour: number) => {
    const candidate = withTime(value, hour, value.getMinutes());
    return candidate.getTime() < min.getTime() || candidate.getTime() > max.getTime();
  };

  const minuteDisabled = (minute: number) => {
    const candidate = withTime(value, value.getHours(), minute);
    return candidate.getTime() < min.getTime() || candidate.getTime() > max.getTime();
  };

  return (
    <div className="date-composer">
      <section className="calendar-panel" aria-label="选择日期">
        <div className="calendar-head">
          <button
            type="button"
            className="calendar-nav"
            aria-label="上个月"
            disabled={prevDisabled}
            onClick={() => {
              playSound("tap");
              setCursor(addMonths(cursor, -1));
            }}
          >
            <ChevronLeft size={14} strokeWidth={1.6} />
          </button>
          <p className="calendar-title">
            <strong>{format(cursor, "M 月")}</strong>
            <span>{format(cursor, "yyyy")}</span>
          </p>
          <button
            type="button"
            className="calendar-nav"
            aria-label="下个月"
            disabled={nextDisabled}
            onClick={() => {
              playSound("tap");
              setCursor(addMonths(cursor, 1));
            }}
          >
            <ChevronRight size={14} strokeWidth={1.6} />
          </button>
        </div>

        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {days.map((day, index) => {
            if (!day) {
              return <span key={`blank-${index}`} className="calendar-blank" />;
            }
            const disabled = isDayDisabled(day);
            const selected = isSameDay(day, value);
            const today = isSameDay(day, new Date());
            return (
              <button
                key={format(day, "yyyy-MM-dd")}
                type="button"
                className={`calendar-day${selected ? " is-selected" : ""}${
                  today ? " is-today" : ""
                }`}
                disabled={disabled}
                aria-pressed={selected}
                aria-label={format(day, "yyyy 年 M 月 d 日")}
                onClick={() => pickDay(day)}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </section>

      <section className="time-panel" aria-label="选择时刻">
        <div className="time-panel-head">
          <span className="field-label">时刻 · Time</span>
          <span className="time-readout">{format(value, "HH:mm")}</span>
        </div>
        <div className="time-cols">
          <TimeColumn
            label="时"
            values={HOURS}
            selected={value.getHours()}
            isDisabled={hourDisabled}
            onPick={pickHour}
          />
          <span className="time-colon" aria-hidden="true">
            :
          </span>
          <TimeColumn
            label="分"
            values={MINUTES}
            selected={value.getMinutes()}
            isDisabled={minuteDisabled}
            onPick={pickMinute}
          />
        </div>
        <p className="time-panel-note">到这一分钟，蜡封松开。</p>
      </section>
    </div>
  );
}
