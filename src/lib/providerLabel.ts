import type { TFunction } from "i18next"

export function providerLabel(t: TFunction, providerId: string): string {
  return t(`providers.names.${providerId}`)
}
