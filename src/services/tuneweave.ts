import { configureTuneWeave } from "@/apis/tuneweave";

export type TuneWeaveCredentialMode = "server" | "client" | "both";

export interface TuneWeavePreferences {
  enabled: boolean;
  baseUrl: string;
  accountPlatform: string;
  account: string;
  credentialMode: TuneWeaveCredentialMode;
  fallbackToBuiltIn: boolean;
  playbackFallback: boolean;
  playbackPlatform: string;
  fallbackPlatforms: string[];
}

const PREFERENCES_KEY = "splayer:tuneweave:preferences:v1";

export const DEFAULT_TUNEWEAVE_PREFERENCES: TuneWeavePreferences = {
  enabled: true,
  baseUrl: "http://127.0.0.1:7832",
  accountPlatform: "netease",
  account: "default",
  credentialMode: "server",
  fallbackToBuiltIn: true,
  playbackFallback: true,
  playbackPlatform: "",
  fallbackPlatforms: [],
};

let configuredBaseUrl = "";

const safeParseObject = (raw: string | null): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))]
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizePreferences = (input: Record<string, unknown>): TuneWeavePreferences => {
  const credentialMode =
    input.credentialMode === "client" || input.credentialMode === "both"
      ? input.credentialMode
      : "server";
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    baseUrl:
      typeof input.baseUrl === "string" && input.baseUrl.trim()
        ? input.baseUrl.trim()
        : DEFAULT_TUNEWEAVE_PREFERENCES.baseUrl,
    accountPlatform:
      typeof input.accountPlatform === "string" && input.accountPlatform.trim()
        ? input.accountPlatform.trim()
        : DEFAULT_TUNEWEAVE_PREFERENCES.accountPlatform,
    account:
      typeof input.account === "string" && input.account.trim()
        ? input.account.trim()
        : DEFAULT_TUNEWEAVE_PREFERENCES.account,
    credentialMode,
    fallbackToBuiltIn:
      typeof input.fallbackToBuiltIn === "boolean" ? input.fallbackToBuiltIn : true,
    playbackFallback:
      typeof input.playbackFallback === "boolean" ? input.playbackFallback : true,
    playbackPlatform:
      typeof input.playbackPlatform === "string" ? input.playbackPlatform.trim() : "",
    fallbackPlatforms: normalizeStringArray(input.fallbackPlatforms),
  };
};

export const getTuneWeavePreferences = (): TuneWeavePreferences => {
  if (typeof localStorage === "undefined") return structuredClone(DEFAULT_TUNEWEAVE_PREFERENCES);
  return normalizePreferences(safeParseObject(localStorage.getItem(PREFERENCES_KEY)));
};

export const setTuneWeavePreferences = (
  update: Partial<TuneWeavePreferences>,
): TuneWeavePreferences => {
  const next = normalizePreferences({ ...getTuneWeavePreferences(), ...update });
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  configuredBaseUrl = "";
  window.dispatchEvent(new CustomEvent("tuneweave:preferences-changed", { detail: next }));
  return next;
};

/**
 * 将非敏感偏好同步到 Electron 主进程。
 * 调用方凭证由主进程在登录响应中自动截获，只保存在主进程内存。
 */
export const ensureTuneWeaveConfigured = async (): Promise<TuneWeavePreferences> => {
  const preferences = getTuneWeavePreferences();
  if (preferences.baseUrl !== configuredBaseUrl) {
    await configureTuneWeave({ baseUrl: preferences.baseUrl });
    configuredBaseUrl = preferences.baseUrl;
  }
  return preferences;
};

/**
 * client 模式只使用调用方凭证。server/both 会提交账户别名；both 模式下若目标平台
 * 已有调用方凭证，主进程会自动移除同平台 account，避免协议冲突。
 */
export const tuneWeaveAccountQuery = (
  preferences: TuneWeavePreferences,
): { account?: string } =>
  preferences.credentialMode === "client" ? {} : { account: preferences.account };

export const tuneWeaveSelectedAccountQuery = (
  preferences: TuneWeavePreferences,
): { platform: string; account?: string } => ({
  platform: preferences.accountPlatform,
  ...tuneWeaveAccountQuery(preferences),
});
