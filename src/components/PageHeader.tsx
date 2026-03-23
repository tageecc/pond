import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Right slot: refresh, date range, currency, etc. */
  actions?: ReactNode
}

/** Shared page header for dashboard/analytics */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-app-text sm:text-xl">
          {title}
        </h1>
        {subtitle != null && (
          <p className="mt-0.5 hidden text-sm text-app-muted sm:block">{subtitle}</p>
        )}
      </div>
      {actions != null && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
