import type { TuneWeaveQrTransaction } from "@shared/types/tuneweave";
import { tuneweaveData } from "@/apis/tuneweave";
import { ensureTuneWeaveConfigured, type TuneWeaveCredentialMode } from "@/services/tuneweave";

export interface TuneWeavePasswordLoginInput {
  platform?: string;
  principalType: string;
  principal: string;
  password: string;
  passwordFormat?: string;
  countryCode?: string;
  credentialMode?: TuneWeaveCredentialMode;
  account?: string;
}

export interface TuneWeaveChallengeInput {
  platform?: string;
  method: string;
  principal: string;
  countryCode?: string;
  credentialMode?: TuneWeaveCredentialMode;
  account?: string;
}

export interface TuneWeaveChallengeTransaction {
  transaction_id: string;
  status?: string;
  expires_at?: string | number | null;
  retry_after_ms?: number | null;
  destination_hint?: string | null;
  [key: string]: unknown;
}

const nonEmpty = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized || undefined;
};

const resolveAuthDefaults = async () => {
  const preferences = await ensureTuneWeaveConfigured();
  return {
    platform: preferences.accountPlatform,
    credentialMode: preferences.credentialMode,
    account: preferences.account,
  };
};

const credentialAccount = (
  mode: TuneWeaveCredentialMode,
  account: string | undefined,
): string | undefined => (mode === "client" ? undefined : nonEmpty(account));

export const loginTuneWeavePassword = async (
  input: TuneWeavePasswordLoginInput,
): Promise<TuneWeaveQrTransaction> => {
  const defaults = await resolveAuthDefaults();
  const platform = nonEmpty(input.platform) ?? defaults.platform;
  const credentialMode = input.credentialMode ?? defaults.credentialMode;
  const principalType = nonEmpty(input.principalType);
  const principal = nonEmpty(input.principal);
  if (!platform || !principalType || !principal || !input.password) {
    throw new Error("platform, principalType, principal and password are required");
  }

  return tuneweaveData<TuneWeaveQrTransaction>({
    method: "POST",
    path: "/v1/auth/password",
    includeCredentials: false,
    body: {
      platform,
      principal_type: principalType,
      principal,
      password: input.password,
      ...(nonEmpty(input.passwordFormat)
        ? { password_format: nonEmpty(input.passwordFormat) }
        : {}),
      ...(nonEmpty(input.countryCode) ? { country_code: nonEmpty(input.countryCode) } : {}),
      credential_mode: credentialMode,
      ...(credentialAccount(credentialMode, input.account ?? defaults.account)
        ? { account: credentialAccount(credentialMode, input.account ?? defaults.account) }
        : {}),
    },
  });
};

export const createTuneWeaveChallenge = async (
  input: TuneWeaveChallengeInput,
): Promise<TuneWeaveChallengeTransaction> => {
  const defaults = await resolveAuthDefaults();
  const platform = nonEmpty(input.platform) ?? defaults.platform;
  const method = nonEmpty(input.method);
  const principal = nonEmpty(input.principal);
  const credentialMode = input.credentialMode ?? defaults.credentialMode;
  if (!platform || !method || !principal) {
    throw new Error("platform, method and principal are required");
  }

  return tuneweaveData<TuneWeaveChallengeTransaction>({
    method: "POST",
    path: "/v1/auth/challenges",
    includeCredentials: false,
    body: {
      platform,
      method,
      principal,
      ...(nonEmpty(input.countryCode) ? { country_code: nonEmpty(input.countryCode) } : {}),
      credential_mode: credentialMode,
      ...(credentialAccount(credentialMode, input.account ?? defaults.account)
        ? { account: credentialAccount(credentialMode, input.account ?? defaults.account) }
        : {}),
    },
  });
};

export const verifyTuneWeaveChallenge = async (
  transactionId: string,
  code: string,
): Promise<TuneWeaveQrTransaction> => {
  const transaction = nonEmpty(transactionId);
  const verificationCode = nonEmpty(code);
  if (!transaction || !verificationCode) {
    throw new Error("transactionId and code are required");
  }
  return tuneweaveData<TuneWeaveQrTransaction>({
    method: "POST",
    path: `/v1/auth/challenges/${encodeURIComponent(transaction)}/verify`,
    includeCredentials: false,
    body: { code: verificationCode },
  });
};

export const validateTuneWeaveChallengeCode = async (input: {
  platform?: string;
  method: string;
  principal: string;
  code: string;
  countryCode?: string;
}): Promise<Record<string, unknown>> => {
  const defaults = await resolveAuthDefaults();
  const platform = nonEmpty(input.platform) ?? defaults.platform;
  const method = nonEmpty(input.method);
  const principal = nonEmpty(input.principal);
  const code = nonEmpty(input.code);
  if (!platform || !method || !principal || !code) {
    throw new Error("platform, method, principal and code are required");
  }
  return tuneweaveData<Record<string, unknown>>({
    method: "POST",
    path: "/v1/auth/challenges/validate",
    includeCredentials: false,
    body: {
      platform,
      method,
      principal,
      code,
      ...(nonEmpty(input.countryCode) ? { country_code: nonEmpty(input.countryCode) } : {}),
    },
  });
};
