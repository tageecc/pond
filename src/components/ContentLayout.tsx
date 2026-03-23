import type { ReactNode } from "react"

/** Shared shell for dashboard/analytics full-width pages; aligns top spacing with instance management */
export function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col overflow-y-auto pt-0 px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pb-8">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 sm:gap-5 min-h-0">
        {children}
      </div>
    </div>
  )
}
