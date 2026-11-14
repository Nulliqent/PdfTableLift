import { useEffect, useRef } from "react";
import { Button } from "./Button";
import styles from "./CopySheet.module.css";

type ConfirmSheetProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A modal question with Cancel and a confirming button. Escape and a click outside cancel. */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby="confirm-sheet-title"
      onCancel={onCancel}
      onKeyDown={(e) => {
        // Escape belongs to this question alone: stop it reaching a window-level Escape handler
        // (Region selection) and the browser's own close, then cancel once.
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onCancel();
      }}
    >
      <div className={styles.box}>
        <h3 id="confirm-sheet-title">{title}</h3>
        <p>{message}</p>
        <div className={styles.actions}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
