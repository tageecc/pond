import type { MouseEvent as ReactMouseEvent } from "react"

export const TITLE_BAR_DRAG_HEIGHT = 38
export const TITLE_BAR_LEFT_INSET = 80

export function onTauriTitleBarDragMouseDown(e: ReactMouseEvent) {
  if (e.button !== 0) return
  const el = e.target as HTMLElement
  if (el.closest("[data-tauri-drag-region='false']")) return
  void import("@tauri-apps/api/webviewWindow").then(({ getCurrentWebviewWindow }) => {
    getCurrentWebviewWindow().startDragging()
  }).catch(() => {})
}
