/**
 * Engine: pure TypeScript detection, joining, Region and export logic plus the workspace reducer.
 * It never imports pdf.js, React or the DOM (enforced by ESLint), so it runs unchanged in Node,
 * the browser or a Web Worker. Its input is the PDF Reader's PageText.
 */
export type { PageText, TextItem } from "../shared/page-text";
