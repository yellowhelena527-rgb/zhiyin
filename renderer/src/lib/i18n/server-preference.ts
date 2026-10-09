import type { LocaleCode } from "@/lib/i18n/locale";

/**
 * SSR/静态导出下的初始 locale。
 * 静态导出（output: export）不能读 cookies()，因此这里返回固定默认值；
 * 运行时真实语言由客户端 <LocaleSyncEffect /> 从本地偏好读取并纠正。
 */
export async function getServerLocale(): Promise<LocaleCode> {
  return "en-US";
}
