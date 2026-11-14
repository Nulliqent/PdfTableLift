import { useEffect, useRef } from "react";
import styles from "./SourcePage.module.css";

/** Puts a canvas made outside React into the tree. */
export function CanvasHost({ canvas }: { canvas: HTMLCanvasElement }) {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    slot.current?.replaceChildren(canvas);
  }, [canvas]);
  return <div ref={slot} className={styles.canvas} />;
}
