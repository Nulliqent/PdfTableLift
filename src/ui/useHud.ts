import { useCallback, useEffect, useRef, useState } from "react";
import type { IconName } from "./components/Icon";

export type HudMessage = { id: number; text: string; icon: IconName; visible: boolean };

const SHOWN_MS = 2000;
/** Long enough for the fade-out to finish before the text leaves the live region. */
const CLEAR_MS = 400;

/** State for the status HUD: `show(text)` displays it briefly. */
export function useHud(): [HudMessage | null, (text: string, icon?: IconName) => void] {
  const [message, setMessage] = useState<HudMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const counter = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string, icon: IconName = "check") => {
    clearTimeout(timer.current);
    // A fresh id makes a repeated message ("Copied as CSV" twice) a new node, so it is announced again.
    setMessage({ id: ++counter.current, text, icon, visible: true });
    timer.current = setTimeout(() => {
      setMessage((m) => (m ? { ...m, visible: false } : m));
      // Once faded, drop the text so a screen reader's browse mode doesn't find a stale message.
      timer.current = setTimeout(() => setMessage(null), CLEAR_MS);
    }, SHOWN_MS);
  }, []);
  return [message, show];
}
