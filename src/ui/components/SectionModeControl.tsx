import type { SectionMode } from "../../engine";
import styles from "./FormatControl.module.css";

const MODES: readonly { mode: SectionMode; label: string }[] = [
  { mode: "column", label: "As Column" },
  { mode: "rows", label: "As Rows" },
];

/** Segmented control for the Section Mode, shown for Tables that have Section Headers. */
export function SectionModeControl({
  value,
  onChange,
}: {
  value: SectionMode;
  onChange: (mode: SectionMode) => void;
}) {
  return (
    <div className={styles.seg} role="group" aria-label="Sections">
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
