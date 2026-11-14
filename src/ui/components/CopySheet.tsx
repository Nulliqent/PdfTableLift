import { useEffect, useRef } from "react";
import { Button } from "./Button";
import styles from "./CopySheet.module.css";

type CopySheetProps = { title: string; text: string; onDone: () => void };

/** Shown when the clipboard is blocked: the export text, pre-selected, to copy by hand (US-49). */
export function CopySheet({ title, text, onDone }: CopySheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    area.current?.focus();
    area.current?.select();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby="copy-sheet-title"
      onClose={onDone}
      onClick={(e) => {
        if (e.target === dialog.current) onDone();
      }}
    >
      <div className={styles.box}>
        <h3 id="copy-sheet-title">{title}</h3>
        <p>
          Your browser blocked automatic copying. The text is selected below: press ⌘C or Ctrl+C.
        </p>
        <textarea ref={area} readOnly value={text} aria-label="Export text" />
        <div className={styles.actions}>
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </dialog>
  );
}
