import type { HudMessage } from "../useHud";
import { Icon } from "./Icon";
import styles from "./Hud.module.css";

/**
 * The floating status HUD ("Copied as CSV"). It is always in the page as a polite live region,
 * so screen readers announce each message.
 */
export function Hud({ message }: { message: HudMessage | null }) {
  return (
    <div
      className={message?.visible ? `${styles.hud} ${styles.show}` : styles.hud}
      role="status"
      aria-live="polite"
    >
      {message && (
        <>
          <Icon name={message.icon} />
          <span>{message.text}</span>
        </>
      )}
    </div>
  );
}
