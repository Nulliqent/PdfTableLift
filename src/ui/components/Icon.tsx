import type { CSSProperties } from "react";
import styles from "./Icon.module.css";

/** The icon set from the design artifact, drawn once as an SVG sprite. */
const SYMBOLS = {
  doc: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  table: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
      <path d="M15.5 8.5V6a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M7 7l10 10M17 7L7 17" />,
  tray: (
    <>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" />
      <path d="M3.5 14.5V18a2.5 2.5 0 0 0 2.5 2.5h12a2.5 2.5 0 0 0 2.5-2.5v-3.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
    </>
  ),
  select: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3.2 2.6" />
      <path d="M13 13l6.5 2.4-2.8 1.1-1.1 2.8z" fill="currentColor" />
    </>
  ),
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />,
  warn: (
    <>
      <path d="M12 4L2.8 19.5h18.4z" />
      <path d="M12 10v4.5M12 17.2v.1" />
    </>
  ),
} as const;

export type IconName = keyof typeof SYMBOLS;

/** Render once near the root so every <Icon> can reference its symbol. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      {Object.entries(SYMBOLS).map(([name, shape]) => (
        <symbol key={name} id={`i-${name}`} viewBox="0 0 24 24">
          {shape}
        </symbol>
      ))}
    </svg>
  );
}

type IconProps = { name: IconName; className?: string; style?: CSSProperties };

export function Icon({ name, className, style }: IconProps) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      style={style}
      aria-hidden="true"
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
