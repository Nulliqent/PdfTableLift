import { useEffect, useLayoutEffect, useRef } from "react";
import styles from "./RowMenu.module.css";

export type RowMenuItem = {
  label: string;
  /** Shown dimmed; it can still be reached with the arrow keys but does nothing. */
  disabled?: boolean;
  onSelect: () => void;
};

type RowMenuProps = {
  /** The menu's accessible name, e.g. "Row 3". */
  label: string;
  /** The row number that opened the menu; the menu sits below it and focus returns to it. */
  anchor: HTMLElement;
  items: RowMenuItem[];
  /** The menu closed. `restoreFocus` is true when focus should go back to the row number. */
  onClose: (restoreFocus: boolean) => void;
};

const GAP = 4;
const EDGE = 8;

/**
 * The menu on a row number (US-18, US-33 to US-36). It is a native popover, so it sits in the top
 * layer above the scrolling Table and a click outside dismisses it. It follows the menu pattern:
 * focus moves to the first item that applies, the arrow keys, Home and End move, Enter or Space
 * chooses, and Escape or Tab closes it.
 */
export function RowMenu({ label, anchor, items, onClose }: RowMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  const itemButtons = () =>
    Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  const close = (restoreFocus: boolean) => {
    if (closing.current) return;
    closing.current = true;
    const el = menu.current;
    if (el?.matches(":popover-open")) el.hidePopover();
    onClose(restoreFocus);
  };

  // Place the menu under the row number, kept inside the viewport, and follow it as the page or the
  // Table scrolls.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const left = Math.max(EDGE, Math.min(a.left, vw - w - EDGE));
      const below = a.bottom + GAP;
      const top = below + h > vh - EDGE && a.top - GAP - h >= EDGE ? a.top - GAP - h : below;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    el.showPopover();
    place();
    const first = itemButtons().find((b) => b.getAttribute("aria-disabled") !== "true");
    (first ?? itemButtons()[0])?.focus();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
    // Opened once per anchor; the parent remounts the menu for another row.
  }, [anchor]);

  // A light dismiss (a click outside) closes the popover by itself: report it.
  useEffect(() => {
    const el = menu.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") close(false);
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  });

  const move = (step: number | "first" | "last") => {
    const all = itemButtons();
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      step === "first"
        ? 0
        : step === "last"
          ? all.length - 1
          : (at + step + all.length) % all.length;
    all[next]!.focus();
  };

  return (
    <div
      ref={menu}
      popover="auto"
      role="menu"
      aria-label={label}
      className={styles.menu}
      onKeyDown={(e) => {
        switch (e.key) {
          case "ArrowDown":
            move(1);
            break;
          case "ArrowUp":
            move(-1);
            break;
          case "Home":
            move("first");
            break;
          case "End":
            move("last");
            break;
          case "Escape":
            // Escape belongs to this menu alone, not to a window-level handler (Region selection).
            e.stopPropagation();
            close(true);
            break;
          case "Tab":
            close(false);
            return; // let focus move on
          default:
            return;
        }
        e.preventDefault();
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={styles.item}
          aria-disabled={item.disabled || undefined}
          onClick={() => {
            if (item.disabled) return;
            close(true);
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
