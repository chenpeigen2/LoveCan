import { defaultLabelLine } from "./date";

export const MAX_SENDER_NAME = 16;
export const MAX_RECIPIENT_NAME = 16;
export const MAX_LABEL_LINE = 24;
export const MAX_LETTER = 2500;
export const MAX_VOICE_SECONDS = 90;

export const WRITING_PROMPTS = [
  "如果只能留下一个下午，我会留下——",
  "有一件事，我一直想让你知道，却总是在开口前咽了回去。",
  "你不在的时候，我把日子过成了——",
  "写给你三十岁那天：",
  "下次你一个人难过的时候，请记得——",
  "我们之间最像爱的，其实是一件很小的事：",
  "如果时间真的能停在某一刻，我希望是——",
  "这封信到的时候，我们应该已经——",
];

export type Skin = "spring" | "winter" | "night";

export const SKINS: {
  id: Skin;
  name: string;
  line: string;
  bg: string;
  label: string;
  wax: string;
}[] = [
  {
    id: "spring",
    name: "春信",
    line: "把春天折进信里",
    bg: "#eadcc3",
    label: "#faf3e3",
    wax: "#8c4032",
  },
  {
    id: "winter",
    name: "冬至",
    line: "等一场雪，也等你",
    bg: "#ddd0b8",
    label: "#efe2ca",
    wax: "#6d3a2b",
  },
  {
    id: "night",
    name: "夜航",
    line: "把话交给夜，和远路",
    bg: "#2c3a44",
    label: "#22303a",
    wax: "#a8432c",
  },
];

export function isSkin(value: string): value is Skin {
  return SKINS.some((skin) => skin.id === value);
}

export function skinById(id: Skin) {
  return SKINS.find((skin) => skin.id === id) ?? SKINS[0];
}

export function suggestLabelLine(date: Date | null): string {
  return defaultLabelLine(date ?? new Date());
}
