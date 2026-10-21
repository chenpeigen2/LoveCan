import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  setSoundMuted,
  soundMuted,
  subscribeSound,
} from "@/lib/sound";

export function SoundToggle() {
  const muted = useSyncExternalStore(
    subscribeSound,
    soundMuted,
    () => false,
  );

  return (
    <button
      type="button"
      className={`sound-toggle ${muted ? "is-muted" : ""}`}
      onClick={() => setSoundMuted(!muted)}
      aria-pressed={!muted}
      aria-label={muted ? "打开动作音" : "关闭动作音"}
      title={muted ? "打开动作音" : "关闭动作音"}
    >
      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      <span className="sound-toggle-label">{muted ? "静音" : "声响"}</span>
    </button>
  );
}
