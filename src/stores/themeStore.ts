import { create } from "zustand"

const STORAGE_KEY = "clawhub-theme"

export type ThemeMode = "light" | "dark" | "system"

export function getSystemDark(): boolean {
  if (typeof window === "undefined") return true
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function loadStored(): ThemeMode {
  if (typeof window === "undefined") return "system"
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === "light" || v === "dark" || v === "system") return v
  return "system"
}

function applyToDocument(isDark: boolean) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", isDark)
}

interface ThemeState {
  mode: ThemeMode
  resolved: "light" | "dark"
  setTheme: (mode: ThemeMode) => void
  init: () => void
}

export const useThemeStore = create<ThemeState>((set, _get) => ({
  mode: "system",
  resolved: "dark",

  setTheme(mode: ThemeMode) {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, mode)
    const isDark = mode === "system" ? getSystemDark() : mode === "dark"
    applyToDocument(isDark)
    set({
      mode,
      resolved: isDark ? "dark" : "light",
    })
  },

  init() {
    const mode = loadStored()
    const isDark = mode === "system" ? getSystemDark() : mode === "dark"
    applyToDocument(isDark)
    set({ mode, resolved: isDark ? "dark" : "light" })

    if (mode === "system" && typeof window !== "undefined") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        const isDark = getSystemDark()
        applyToDocument(isDark)
        set({ resolved: isDark ? "dark" : "light" })
      })
    }
  },
}))
