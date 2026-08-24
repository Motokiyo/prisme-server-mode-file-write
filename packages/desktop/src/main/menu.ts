import { BrowserWindow, Menu } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import {
  DESKTOP_MENU,
  desktopMenuVisible,
  type DesktopMenuEntry,
  type DesktopMenuRole,
} from "@opencode-ai/app/desktop-menu"

import { UPDATER_ENABLED } from "./constants"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { openExternalURL } from "./windows"
import { nativeT } from "./native-translations"
import type { DesktopNativeKey } from "@opencode-ai/app/i18n/desktop-native"

// Prisme branding: the shared menu definition in @opencode-ai/app is upstream's and
// carries OpenCode labels and links. Remap them here so packages/app stays untouched.
const PRISME_REPO = "https://github.com/EliottMeunierFluid/prismeworkspace"
const PRISME_LABELS: Partial<Record<DesktopNativeKey, string>> = {
  "desktop.menu.app": "Prisme",
  "desktop.menu.supportForum": "Prisme Repository",
}
const PRISME_LINKS: Record<string, string> = {
  "https://discord.com/invite/opencode": PRISME_REPO,
  "https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml": `${PRISME_REPO}/issues/new`,
  "https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml": `${PRISME_REPO}/issues/new`,
}

function prismeT(key: DesktopNativeKey) {
  return PRISME_LABELS[key] ?? nativeT(key)
}

function prismeHref(href: string) {
  return PRISME_LINKS[href] ?? href
}

type Deps = {
  trigger: (id: string) => void
  checkForUpdates: () => void
  relaunch: () => void
}

export function createMenu(deps: Deps) {
  if (process.platform !== "darwin") return

  const template = DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "macos")).map((menu) => {
    if (menu.role) return { role: nativeRole(menu.role), label: prismeT(menu.labelKey) }
    return {
      label: prismeT(menu.labelKey),
      submenu: menu.items
        ?.filter((entry) => desktopMenuVisible(entry, "macos"))
        .map((entry) => nativeItem(entry, deps)),
    }
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function nativeItem(entry: DesktopMenuEntry, deps: Deps): MenuItemConstructorOptions {
  if (entry.type === "separator") return { type: "separator" }
  if (entry.role) return { role: nativeRole(entry.role), label: entry.labelKey ? prismeT(entry.labelKey) : undefined }

  const item: MenuItemConstructorOptions = {
    label: entry.labelKey ? prismeT(entry.labelKey) : undefined,
    accelerator: entry.accelerator?.macos,
    enabled: entry.enabled === "updater" ? UPDATER_ENABLED : undefined,
  }

  if (entry.command) {
    const command = entry.command
    item.click = () => deps.trigger(command)
  }
  if (entry.action) {
    const action = entry.action
    item.click = () =>
      runDesktopMenuAction(BrowserWindow.getFocusedWindow(), action, {
        checkForUpdates: deps.checkForUpdates,
        relaunch: deps.relaunch,
      })
  }
  if (entry.href) {
    const href = prismeHref(entry.href)
    item.click = () => openExternalURL(href)
  }

  return item
}

function nativeRole(role: DesktopMenuRole) {
  return role as NonNullable<MenuItemConstructorOptions["role"]>
}
