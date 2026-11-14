import type { ComponentProps } from "react";
import { ColumnSpacingPanel } from "./ColumnSpacingPanel";
import { DocumentList } from "./DocumentList";
import { DropArea } from "./DropArea";
import styles from "./Sidebar.module.css";

type SidebarProps = ComponentProps<typeof DocumentList> & {
  onOpen: () => void;
  columnSpacing: number;
  onColumnSpacing: (value: number) => void;
  join: boolean;
  onJoin: (value: boolean) => void;
};

/** Source-list sidebar: drop area, Documents and the Column Spacing panel. */
export function Sidebar({
  onOpen,
  columnSpacing,
  onColumnSpacing,
  join,
  onJoin,
  ...list
}: SidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Documents">
      <DropArea onOpen={onOpen} />
      <DocumentList {...list} />
      <ColumnSpacingPanel
        value={columnSpacing}
        onChange={onColumnSpacing}
        join={join}
        onJoinChange={onJoin}
      />
    </aside>
  );
}
