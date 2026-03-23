import ReactDOM from "react-dom/client"
import App from "./App"
import { loadAppConfig, saveAppConfig } from "./lib/appStore"
import { initI18n } from "./i18n"
import { detectSystemLocale, type AppLocale } from "./lib/locale"
import { syncNativeMenus } from "./lib/syncNativeMenus"
import { useAppStore } from "./stores/appStore"

async function bootstrap() {
  const cfg = await loadAppConfig().catch((): undefined => undefined)
  const lng: AppLocale =
    cfg?.locale === "zh" || cfg?.locale === "en"
      ? cfg.locale
      : detectSystemLocale()
  await initI18n(lng)
  if (!cfg?.locale) {
    await saveAppConfig({ locale: lng }).catch(() => {})
  }
  useAppStore.setState({ locale: lng })
  await syncNativeMenus()
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <App />,
  )
}

void bootstrap()
