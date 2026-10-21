import { addDays, addMonths, addYears, format, startOfDay } from "date-fns";

export const MIN_UNLOCK_SECONDS = 60;
export const MAX_UNLOCK_YEARS = 10;

export type DatePreset =
  | "oneDay"
  | "oneWeek"
  | "oneMonth"
  | "halfYear"
  | "oneYear"
  | "custom";

export const DATE_PRESETS: {
  id: Exclude<DatePreset, "custom">;
  label: string;
  hint: string;
}[] = [
  { id: "oneDay", label: "一天后", hint: "等一觉醒来" },
  { id: "oneWeek", label: "一周后", hint: "等七个日落" },
  { id: "oneMonth", label: "一个月后", hint: "等一场雨停" },
  { id: "halfYear", label: "半年后", hint: "等季节转弯" },
  { id: "oneYear", label: "一年后", hint: "等同一个今天" },
];

export function presetDate(
  preset: Exclude<DatePreset, "custom">,
  now = new Date(),
): Date {
  const base = new Date(now);
  base.setSeconds(0, 0);
  if (preset === "oneDay") return addDays(base, 1);
  if (preset === "oneWeek") return addDays(base, 7);
  if (preset === "oneMonth") return startOfDay(addMonths(base, 1));
  if (preset === "halfYear") return startOfDay(addMonths(base, 6));
  return startOfDay(addYears(base, 1));
}

export function maxUnlockDate(now = new Date()): Date {
  return addYears(now, MAX_UNLOCK_YEARS);
}

export function formatLongDate(date: Date): string {
  return format(date, "yyyy 年 M 月 d 日");
}

export function formatShortDate(date: Date): string {
  return format(date, "yyyy.MM.dd");
}

export function formatTime(date: Date): string {
  return format(date, "HH:mm");
}

export function validateUnlockAt(
  target: Date,
  now = new Date(),
): string | null {
  const min = now.getTime() + MIN_UNLOCK_SECONDS * 1000;
  const max = addYears(now, MAX_UNLOCK_YEARS).getTime();
  if (target.getTime() < min) {
    return "再往后一点。这只罐子至少需要等一分钟。";
  }
  if (target.getTime() > max) {
    return "十年已经很长了。选一个近一点的日子吧。";
  }
  return null;
}

export type Season = "spring" | "summer" | "autumn" | "winter";

export const SEASON_NAMES: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

export function seasonOf(date: Date): Season {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// 每个季节三句按月份排列，另附一句备选。
const SEASON_LINES: Record<Season, readonly string[]> = {
  spring: ["把春天留给你", "等第一场春雨", "花开的时候，拆", "等风变暖再读"],
  summer: ["等一场长长的夏", "等蝉鸣最响的时候", "天最热的时候拆", "把盛夏封进罐里"],
  autumn: ["等一个凉天", "桂花开了再打开", "等落叶铺满台阶", "把秋天留给你"],
  winter: ["等第一场雪", "在最冷的时候读", "把冬天煨热", "下雪的时候打开"],
};

const SEASON_START: Record<Season, number> = {
  spring: 3,
  summer: 6,
  autumn: 9,
  winter: 12,
};

export function labelSuggestions(date: Date | null): readonly string[] {
  return SEASON_LINES[seasonOf(date ?? new Date())];
}

export function defaultLabelLine(date: Date): string {
  const season = seasonOf(date);
  const month = date.getMonth() + 1;
  const index = (month - SEASON_START[season] + 12) % SEASON_LINES[season].length;
  return SEASON_LINES[season][index];
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

export function countdownParts(target: Date, now = new Date()): CountdownParts {
  const totalSeconds = Math.max(
    0,
    Math.floor((target.getTime() - now.getTime()) / 1000),
  );
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalSeconds };
}

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function humanRemaining(target: Date, now = new Date()): string {
  const { days, hours, minutes, seconds, totalSeconds } = countdownParts(
    target,
    now,
  );
  if (totalSeconds <= 0) return "时间到了";
  if (days > 0) return `还有 ${days} 天 ${hours} 小时`;
  if (hours > 0) return `还有 ${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `还有 ${minutes} 分钟 ${seconds} 秒`;
  return `还有 ${seconds} 秒`;
}
