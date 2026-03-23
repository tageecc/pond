import type { i18n as I18nType } from "i18next"

type ModelsCatalogBundle = { descriptions?: Record<string, string> }

export function getModelCatalogDescription(i18n: I18nType, modelId: string): string {
  const bundle = i18n.getResource(i18n.language, "translation", "modelsCatalog") as
    | ModelsCatalogBundle
    | undefined
  return bundle?.descriptions?.[modelId] ?? ""
}
