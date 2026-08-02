import { configureTuneWeave } from "@/apis/tuneweave";

export type TuneWeaveCredentialMode = "server" | "client" | "both";

export interface TuneWeavePreferences {
  enabled: boolean;
  baseUrl: string;
  account: string;
  credentialMode: TuneWeaveCredentialMode;
  fallbackToBuiltIn: boolean;
  playbackFallback: boolean;
  playbackPlatform: string;
  fallbackPlatforms: string[];
}

const PREFERENCES_KEY = "splayer:tuneweave:preferences:v1";
const CREDENTIALS_KEY = "splayer:tuneweave:credentials:v1";

export const DEFAULT_TUNEWEAVE_PREFERENCES: TuneWeavePreferences = {
  enabled: true,
  baseUrl: "http://127.0.0.1:7832",
  account: "default",
  credentialMode: "server",
  fallbackToBuiltIn: true,
  playbackFallback: true,
  playbackPlatform: "",
  fallbackPlatforms: [],
};

let configuredFingerprint = "";

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
  configuredFingerprint = "";
  window.dispatchEvent(new CustomEvent("tuneweave:preferences-changed", { detail: next }));
  return next;
};

export const getTuneWeaveCredentials = (): string[] => {
  if (typeof sessionStorage === "undefined") return [];
  const raw = sessionStorage.getItem(CREDENTIALS_KEY);
  if (!raw) return [];
  try {
    return normalizeStringArray(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const setTuneWeaveCredentials = (credentials: readonly string[]): string[] => {
  const next = normalizeStringArray(credentials);
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(next));
  configuredFingerprint = "";
  return next;
};

export const addTuneWeaveCredential = (credential: string): string[] =>
  setTuneWeaveCredentials([...getTuneWeaveCredentials(), credential]);

export const removeTuneWeaveCredential = (credential: string): string[] =>
  setTuneWeaveCredentials(getTuneWeaveCredentials().filter((item) => item !== credential));

export const clearStoredTuneWeaveCredentials = (): void => {
  sessionStorage.removeItem(CREDENTIALS_KEY);
  configuredFingerprint = "";
};

/**
 * 将浏览器侧偏好同步到 Electron 主进程。
 * 凭证仅来自 sessionStorage，并且主进程只保存在内存中。
 */
export const ensureTuneWeaveConfigured = async (): Promise<TuneWeavePreferences> => {
  const preferences = getTuneWeavePreferences();
  const credentials = getTuneWeaveCredentials();
  const fingerprint = JSON.stringify([preferences.baseUrl, credentials]);
  if (fingerprint !== configuredFingerprint) {
    await configureTuneWeave({ baseUrl: preferences.baseUrl, credentials });
    configuredFingerprint = fingerprint;
  }
  return preferences;
};

/** client 模式不能同时提交显式 account。 */
export const tuneWeaveAccountQuery = (
  preferences: TuneWeavePreferences,
): { account?: string } =>
  preferences.credentialMode === "client" ? {} : { account: preferences.account };
