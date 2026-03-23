import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import { detectSystemLocale, type AppLocale } from "../lib/locale"
import enCommon from "../locales/en/common.json"
import enNav from "../locales/en/nav.json"
import enSettings from "../locales/en/settings.json"
import enMenu from "../locales/en/menu.json"
import enTray from "../locales/en/tray.json"
import enSidebar from "../locales/en/sidebar.json"
import enInstanceSwitcher from "../locales/en/instanceSwitcher.json"
import enCreateInstance from "../locales/en/createInstance.json"
import enTheme from "../locales/en/theme.json"
import enTitleBarGateway from "../locales/en/titleBarGateway.json"
import enToast from "../locales/en/toast.json"
import enAgent from "../locales/en/agent.json"
import enDashboard from "../locales/en/dashboard.json"
import enNotifications from "../locales/en/notifications.json"
import enOnboarding from "../locales/en/onboarding.json"
import enAnalytics from "../locales/en/analytics.json"
import enChat from "../locales/en/chat.json"
import enAgentView from "../locales/en/agentView.json"
import enModelsCatalog from "../locales/en/modelsCatalog.json"
import enModelIdField from "../locales/en/modelIdField.json"
import enProviders from "../locales/en/providers.json"
import enChannelTypes from "../locales/en/channelTypes.json"
import enExecutionTimeline from "../locales/en/executionTimeline.json"
import enGatewayLog from "../locales/en/gatewayLog.json"
import enChannelBindings from "../locales/en/channelBindings.json"
import enConfigWizard from "../locales/en/configWizard.json"
import zhCommon from "../locales/zh/common.json"
import zhNav from "../locales/zh/nav.json"
import zhSettings from "../locales/zh/settings.json"
import zhMenu from "../locales/zh/menu.json"
import zhTray from "../locales/zh/tray.json"
import zhSidebar from "../locales/zh/sidebar.json"
import zhInstanceSwitcher from "../locales/zh/instanceSwitcher.json"
import zhCreateInstance from "../locales/zh/createInstance.json"
import zhTheme from "../locales/zh/theme.json"
import zhTitleBarGateway from "../locales/zh/titleBarGateway.json"
import zhToast from "../locales/zh/toast.json"
import zhAgent from "../locales/zh/agent.json"
import zhDashboard from "../locales/zh/dashboard.json"
import zhNotifications from "../locales/zh/notifications.json"
import zhOnboarding from "../locales/zh/onboarding.json"
import zhAnalytics from "../locales/zh/analytics.json"
import zhChat from "../locales/zh/chat.json"
import zhAgentView from "../locales/zh/agentView.json"
import zhModelsCatalog from "../locales/zh/modelsCatalog.json"
import zhModelIdField from "../locales/zh/modelIdField.json"
import zhProviders from "../locales/zh/providers.json"
import zhChannelTypes from "../locales/zh/channelTypes.json"
import zhExecutionTimeline from "../locales/zh/executionTimeline.json"
import zhGatewayLog from "../locales/zh/gatewayLog.json"
import zhChannelBindings from "../locales/zh/channelBindings.json"
import zhConfigWizard from "../locales/zh/configWizard.json"

const en = {
  ...enCommon,
  ...enNav,
  ...enSettings,
  ...enMenu,
  ...enTray,
  ...enSidebar,
  ...enInstanceSwitcher,
  ...enCreateInstance,
  ...enTheme,
  ...enTitleBarGateway,
  ...enToast,
  ...enAgent,
  ...enDashboard,
  ...enNotifications,
  ...enOnboarding,
  ...enAnalytics,
  ...enChat,
  ...enAgentView,
  ...enModelsCatalog,
  ...enModelIdField,
  ...enProviders,
  ...enChannelTypes,
  ...enExecutionTimeline,
  ...enGatewayLog,
  ...enChannelBindings,
  ...enConfigWizard,
}
const zh = {
  ...zhCommon,
  ...zhNav,
  ...zhSettings,
  ...zhMenu,
  ...zhTray,
  ...zhSidebar,
  ...zhInstanceSwitcher,
  ...zhCreateInstance,
  ...zhTheme,
  ...zhTitleBarGateway,
  ...zhToast,
  ...zhAgent,
  ...zhDashboard,
  ...zhNotifications,
  ...zhOnboarding,
  ...zhAnalytics,
  ...zhChat,
  ...zhAgentView,
  ...zhModelsCatalog,
  ...zhModelIdField,
  ...zhProviders,
  ...zhChannelTypes,
  ...zhExecutionTimeline,
  ...zhGatewayLog,
  ...zhChannelBindings,
  ...zhConfigWizard,
}

const resources = {
  en: { translation: en },
  zh: { translation: zh },
} as const

export async function initI18n(initialLng?: AppLocale): Promise<void> {
  const lng = initialLng ?? detectSystemLocale()
  await i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}

export function setAppLocale(lng: AppLocale): void {
  void i18n.changeLanguage(lng)
}

export default i18n
