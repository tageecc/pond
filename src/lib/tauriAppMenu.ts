import type { TFunction } from "i18next"
import { useAppStore } from "@/stores/appStore"

function isMac(): boolean {
  return navigator.platform.toLowerCase().includes("mac")
}

export async function installTauriAppMenu(
  t: TFunction,
  isCancelled: () => boolean,
): Promise<void> {
  const { Menu, Submenu } = await import("@tauri-apps/api/menu")
  const openPrefs = () => useAppStore.getState().setPreferencesOpen(true)

  const mac = isMac()

  const [pondSub, fileSub, editSub, viewSub, windowSub] = await Promise.all([
    Submenu.new({
      text: t("menu.pond"),
      items: [
        { item: { About: { name: "ClawTeam" } }, text: t("menu.about") },
        { item: "Services", text: t("menu.services") },
        { item: "Separator" },
        { item: "Hide", text: t("menu.hide") },
        { item: "HideOthers", text: t("menu.hideOthers") },
        { item: "ShowAll", text: t("menu.showAll") },
        { item: "Separator" },
        {
          id: "preferences",
          text: t("menu.preferences"),
          accelerator: "CmdOrControl+,",
          action: openPrefs,
        },
        { item: "Separator" },
        { item: "Quit", text: t("menu.quit") },
      ],
    }),
    Submenu.new({
      text: t("menu.file"),
      items: [
        { item: "CloseWindow", text: t("menu.closeWindow") },
      ],
    }),
    Submenu.new({
      text: t("menu.edit"),
      items: [
        { item: "Undo", text: t("menu.undo") },
        { item: "Redo", text: t("menu.redo") },
        { item: "Separator" },
        { item: "Cut", text: t("menu.cut") },
        { item: "Copy", text: t("menu.copy") },
        { item: "Paste", text: t("menu.paste") },
        { item: "SelectAll", text: t("menu.selectAll") },
      ],
    }),
    Submenu.new({
      text: t("menu.view"),
      items: [
        { item: "Fullscreen", text: t("menu.toggleFullScreen") },
      ],
    }),
    Submenu.new({
      text: t("menu.window"),
      items: [
        { item: "Minimize", text: t("menu.minimize") },
        { item: "Maximize", text: t("menu.zoom") },
      ],
    }),
  ])

  const helpSub = mac
    ? await Submenu.new({ text: t("menu.help"), items: [] })
    : null

  const menu = await Menu.new({
    items: helpSub
      ? [pondSub, fileSub, editSub, viewSub, windowSub, helpSub]
      : [pondSub, fileSub, editSub, viewSub, windowSub],
  })

  if (isCancelled()) return
  await menu.setAsAppMenu()

  if (mac && helpSub && !isCancelled()) {
    await windowSub.setAsWindowsMenuForNSApp()
    await helpSub.setAsHelpMenuForNSApp()
  }
}
