import { EXPORT_FORMATS, type ExportFormat } from "../../engine";
import styles from "./FormatControl.module.css";

/** Segmented control for the export format. */
export function FormatControl({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}) {
  return (
    <div className={styles.seg} role="group" aria-label="Export format">
      {EXPORT_FORMATS.map(({ format, label, name }) => (
        <button
          key={format}
          type="button"
          aria-pressed={value === format}
          aria-label={name}
          onClick={() => onChange(format)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
