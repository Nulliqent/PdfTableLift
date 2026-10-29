import { useCallback, useEffect, useRef, useState } from "react";
import type { IconName } from "./components/Icon";

export type HudMessage = { text: string; icon: IconName; visible: boolean };

const SHOWN_MS = 2000;

/** State for the status HUD: `show(text)` displays it briefly. */
export function useHud(): [HudMessage | null, (text: string, icon?: IconName) => void] {
  const [message, setMessage] = useState<HudMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string, icon: IconName = "check") => {
    clearTimeout(timer.current);
    setMessage({ text, icon, visible: true });
    timer.current = setTimeout(
      () => setMessage((m) => (m ? { ...m, visible: false } : m)),
      SHOWN_MS,
    );
  }, []);
  return [message, show];
}
