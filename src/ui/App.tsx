import { ContentPane } from "./components/ContentPane";
import { IconSprite } from "./components/Icon";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import styles from "./App.module.css";

/** macOS-style split view: translucent toolbar, source-list sidebar and content pane. */
export function App() {
  return (
    <>
      <IconSprite />
      <div className={styles.app}>
        <Toolbar />
        <div className={styles.split}>
          <Sidebar />
          <ContentPane />
        </div>
      </div>
    </>
  );
}
