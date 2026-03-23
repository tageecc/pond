import { useMemo, useState, useRef, useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import type { ModelInfo } from "../constants/models"
import { getModelsByProvider } from "../constants/models"
import { getModelCatalogDescription } from "../lib/modelCatalogDescriptions"
import { Input } from "./ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover"
import { cn } from "../lib/utils"
import type { TFunction } from "i18next"

function metaLine(m: ModelInfo, t: TFunction, catalogDesc: string): string {
  if (m.contextWindow === 0 && m.cost.input === 0 && m.cost.output === 0) {
    return catalogDesc
  }
  const ctx =
    m.contextWindow >= 1_000_000
      ? `${(m.contextWindow / 1_000_000).toFixed(1)}M`
      : `${Math.round(m.contextWindow / 1000)}k`
  const c = m.cost
  const base = t("modelIdField.meta.pricing", {
    ctx,
    input: c.input,
    output: c.output,
  })
  const cache =
    c.cacheRead != null ? t("modelIdField.meta.cacheSuffix", { rate: c.cacheRead }) : ""
  return base + cache
}

function matchesQuery(m: ModelInfo, q: string, catalogDesc: string): boolean {
  if (!q) return true
  const s = q.toLowerCase()
  return (
    m.id.toLowerCase().includes(s) ||
    m.name.toLowerCase().includes(s) ||
    catalogDesc.toLowerCase().includes(s)
  )
}

export function ModelIdField({
  provider,
  value,
  onChange,
  disabled,
  size = "md",
  triggerClassName,
}: {
  provider: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  size?: "sm" | "md"
  triggerClassName?: string
}) {
  const { t, i18n } = useTranslation()
  const catalog = useMemo(() => getModelsByProvider(provider), [provider])

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlightIndex, setHighlightIndex] = useState(0)
  const queryRef = useRef(query)
  queryRef.current = query
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    return catalog.filter((m) =>
      matchesQuery(m, q, getModelCatalogDescription(i18n, m.id))
    )
  }, [catalog, query, i18n])

  useEffect(() => {
    if (!open) return
    setHighlightIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open || filtered.length === 0) return
    const el = listRef.current?.querySelector(`[data-idx="${highlightIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [highlightIndex, open, filtered.length])

  const compact = size === "sm"
  const height = compact ? "h-9 text-sm" : "h-10"

  const commitClose = useCallback(
    (nextId: string) => {
      onChange(nextId)
      queryRef.current = nextId
      setQuery("")
      setOpen(false)
    },
    [onChange]
  )

  const handleOpenChange = (next: boolean) => {
    setOpen((prevOpen) => {
      if (!next && prevOpen) {
        const t = queryRef.current.trim()
        if (t !== value) onChange(t)
      }
      return next
    })
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        setQuery(value)
        setOpen(true)
      }
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === "Enter") {
      e.preventDefault()
      const pick = filtered[highlightIndex]
      if (pick) commitClose(pick.id)
      return
    }
    if (e.key === "Escape") {
      e.preventDefault()
      queryRef.current = value
      setQuery(value)
      handleOpenChange(false)
      return
    }
  }

  if (provider === "custom" || catalog.length === 0) {
    return (
      <Input
        placeholder={t("modelIdField.customPlaceholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "rounded-xl border-app-border bg-app-surface text-app-text placeholder:text-app-muted",
          height,
          triggerClassName
        )}
      />
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn("relative w-full", disabled && "pointer-events-none opacity-60")}
        >
          <Input
            ref={inputRef}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={disabled}
            value={open ? query : value}
            placeholder={t("modelIdField.searchPlaceholder")}
            onChange={(e) => {
              const t = e.target.value
              setQuery(t)
              if (!open) setOpen(true)
            }}
            onKeyDown={onInputKeyDown}
            onFocus={() => {
              if (!disabled) {
                setQuery(value)
                setOpen(true)
              }
            }}
            className={cn(
              "w-full rounded-xl border-app-border bg-app-surface pr-9 font-mono text-sm text-app-text placeholder:text-app-muted placeholder:font-sans",
              height,
              triggerClassName
            )}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            className="absolute right-0 top-0 flex h-full w-9 items-center justify-center rounded-r-xl text-app-muted hover:text-app-text"
            onClick={() => {
              if (disabled) return
              if (open) {
                handleOpenChange(false)
              } else {
                setQuery(value)
                handleOpenChange(true)
                requestAnimationFrame(() => inputRef.current?.focus())
              }
            }}
            aria-label={t("modelIdField.expandList")}
          >
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        className={cn(
          "w-[var(--radix-popper-anchor-width)] min-w-[min(100%,260px)] max-w-[min(100vw-2rem,28rem)] border border-app-border bg-app-surface p-0 shadow-xl shadow-black/20 outline-none",
          "rounded-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        )}
      >
        <div className="border-b border-app-border/80 px-3 py-1.5 text-xs text-app-muted">
          {t("modelIdField.hint")}
        </div>
        <div
          ref={listRef}
          className="max-h-[min(22rem,70vh)] overflow-y-auto overscroll-contain p-1.5"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="rounded-xl px-3 py-8 text-center text-sm text-app-muted">
              {t("modelIdField.empty")}
            </div>
          ) : (
            filtered.map((m, idx) => {
              const highlighted = idx === highlightIndex
              const meta = metaLine(m, t, getModelCatalogDescription(i18n, m.id))
              return (
                <button
                  key={m.id}
                  type="button"
                  data-idx={idx}
                  role="option"
                  aria-selected={highlighted}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors",
                    "hover:bg-claw-500/10 focus-visible:bg-claw-500/10 focus-visible:outline-none",
                    highlighted && "bg-claw-500/15 ring-1 ring-claw-500/35"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => commitClose(m.id)}
                >
                  <span className="font-mono text-sm font-medium leading-snug text-app-text">{m.id}</span>
                  {meta ? (
                    <span className="text-xs leading-relaxed text-app-muted">{meta}</span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
