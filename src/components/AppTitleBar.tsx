import { useAppStore } from "../stores/appStore"
import {
  onTauriTitleBarDragMouseDown,
  TITLE_BAR_DRAG_HEIGHT,
  TITLE_BAR_LEFT_INSET,
} from "../lib/tauriTitleBarDrag"
import { LayoutDashboard, BarChart3, Settings2 } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs"
import { TitleBarGateway } from "./TitleBarGateway"

const TITLE_BAR_HEIGHT = TITLE_BAR_DRAG_HEIGHT
const LEFT_INSET = TITLE_BAR_LEFT_INSET

const TOP_NAV = [
  { id: "dashboard" as const, label: "概览", icon: LayoutDashboard },
  { id: "analytics" as const, label: "数据分析", icon: BarChart3 },
  { id: "agents" as const, label: "实例管理", icon: Settings2 },
] as const

type NavId = (typeof TOP_NAV)[number]["id"]

function viewToTabValue(view: string): NavId {
  return view === "chat" || view === "agents" ? "agents" : (view as NavId)
}

export function AppTitleBar() {
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const tabValue = viewToTabValue(currentView)
  /** Show gateway chip only on instance-related views (not dashboard/analytics) */
  const showTitleBarGateway =
    currentView === "chat" || currentView === "agents"

  return (
    <header
      className="flex shrink-0 items-stretch bg-transparent mt-4 mb-1 safe-area-inset-top px-4 pointer-events-none"
      style={{ height: TITLE_BAR_HEIGHT, minHeight: TITLE_BAR_HEIGHT }}
    >
      <div
        className="titlebar-drag min-w-[60px] flex-1 self-stretch pointer-events-auto cursor-default"
        style={{ paddingLeft: LEFT_INSET }}
        data-tauri-drag-region
        onMouseDown={onTauriTitleBarDragMouseDown}
      />

      <Tabs value={tabValue} onValueChange={(v) => setCurrentView(v as NavId)} className="flex shrink-0 pointer-events-auto titlebar-no-drag">
        <TabsList className="!bg-transparent shadow-none">
          {TOP_NAV.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} title={label} className="gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {showTitleBarGateway ? (
        <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-end">
          <div
            className="titlebar-drag min-w-[32px] flex-1 self-stretch cursor-default pointer-events-auto"
            data-tauri-drag-region
            onMouseDown={onTauriTitleBarDragMouseDown}
          />
          <div className="pointer-events-auto titlebar-no-drag flex shrink-0 items-center self-center pr-2 sm:pr-3">
            <TitleBarGateway />
          </div>
        </div>
      ) : (
        <div
          className="titlebar-drag min-w-[60px] flex-1 self-stretch cursor-default pointer-events-auto"
          data-tauri-drag-region
          onMouseDown={onTauriTitleBarDragMouseDown}
        />
      )}
    </header>
  )
}

export { TITLE_BAR_HEIGHT }
