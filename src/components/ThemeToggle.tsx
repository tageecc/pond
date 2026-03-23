import { Sun, Moon, Monitor } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useThemeStore, type ThemeMode } from "../stores/themeStore"
import { clsx } from "clsx"

const MODES: ThemeMode[] = ["light", "dark", "system"]

const ICONS: Record<ThemeMode, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const { mode, setTheme } = useThemeStore()

  return (
    <div className="flex items-center rounded-lg border border-app-border bg-app-elevated p-0.5">
      {MODES.map((value) => {
        const Icon = ICONS[value]
        const label = t(`theme.${value}`)
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            title={label}
            aria-label={label}
            className={clsx(
              "flex items-center justify-center rounded-md p-2 transition-colors",
              mode === value
                ? "bg-claw-500 text-white"
                : "text-app-muted hover:text-app-text hover:bg-app-hover",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
