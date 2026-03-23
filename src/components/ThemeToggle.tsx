import { Sun, Moon, Monitor } from "lucide-react"
import { useThemeStore, type ThemeMode } from "../stores/themeStore"
import { clsx } from "clsx"

const options: { value: ThemeMode; icon: React.ElementType; label: string }[] = [
  { value: "light", icon: Sun, label: "浅色" },
  { value: "dark", icon: Moon, label: "深色" },
  { value: "system", icon: Monitor, label: "跟随系统" },
]

export function ThemeToggle() {
  const { mode, setTheme } = useThemeStore()

  return (
    <div className="flex items-center rounded-lg border border-app-border bg-app-elevated p-0.5">
      {options.map(({ value, icon: Icon, label }) => (
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
              : "text-app-muted hover:text-app-text hover:bg-app-hover"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
