import type { ExportFile } from "../engine";

/**
 * Saves the file on the device through a blob link. Nothing is sent anywhere (ADR 0001): the
 * browser writes the blob straight to the user's downloads.
 */
export function downloadFile({ name, type, text }: ExportFile): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers read the blob after click() returns, so let it go on the next task.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
