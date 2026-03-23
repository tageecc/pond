"use client"

import { useThemeStore } from "@/stores/themeStore"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const resolved = useThemeStore((s) => s.resolved)

  return (
    <Sonner
      theme={resolved as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-app-elevated group-[.toaster]:text-app-text group-[.toaster]:border group-[.toaster]:border-app-border group-[.toaster]:rounded-lg group-[.toaster]:shadow-[0_-1px_6px_rgba(0,0,0,0.03),0_1px_6px_rgba(0,0,0,0.03),0_0_8px_rgba(0,0,0,0.04)] dark:group-[.toaster]:shadow-[0_-1px_6px_rgba(0,0,0,0.12),0_1px_6px_rgba(0,0,0,0.08),0_0_8px_rgba(0,0,0,0.15)]",
          description: "group-[.toast]:text-app-muted",
          /* Primary action: secondary fill vs app-elevated toast background */
          actionButton:
            "!inline-flex !h-9 !shrink-0 !items-center !justify-center !rounded-md !border !border-border !bg-secondary !px-4 !text-xs !font-medium !text-secondary-foreground !shadow-sm hover:!bg-secondary/85 hover:!text-secondary-foreground focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-app-elevated",
          cancelButton:
            "!inline-flex !h-9 !shrink-0 !items-center !justify-center !rounded-md !border !border-border/70 !bg-muted/60 !px-3 !text-xs !font-medium !text-muted-foreground !shadow-sm hover:!bg-muted hover:!text-foreground focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-ring focus-visible:!ring-offset-2 focus-visible:!ring-offset-app-elevated",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
