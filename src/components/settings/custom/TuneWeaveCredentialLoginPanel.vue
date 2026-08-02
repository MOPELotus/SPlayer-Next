<script setup lang="ts">
import {
  createTuneWeaveChallenge,
  loginTuneWeavePassword,
  verifyTuneWeaveChallenge,
} from "@/apis/auth/tuneweave";
import { getTuneWeavePreferences, type TuneWeaveCredentialMode } from "@/services/tuneweave";
import { toast } from "@/composables/useToast";
import IconLucideKeyRound from "~icons/lucide/key-round";
import IconLucideMessageSquareCode from "~icons/lucide/message-square-code";

const mode = ref<"password" | "sms">("password");
const preferences = ref(getTuneWeavePreferences());
const platform = ref(preferences.value.accountPlatform);
const credentialMode = ref<TuneWeaveCredentialMode>(preferences.value.credentialMode);
const account = ref(preferences.value.account);

const principalType = ref("phone");
const principal = ref("");
const countryCode = ref("86");
const password = ref("");
const passwordFormat = ref("");
const passwordLoading = ref(false);

const smsMethod = ref("sms");
const transactionId = ref("");
const verificationCode = ref("");
const challengeLoading = ref(false);
const verifyLoading = ref(false);
const challengeHint = ref("");

const refreshPreferences = (): void => {
  preferences.value = getTuneWeavePreferences();
  platform.value = preferences.value.accountPlatform;
  credentialMode.value = preferences.value.credentialMode;
  account.value = preferences.value.account;
};

const resultStoredCredential = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const credential = (value as Record<string, unknown>).caller_credential;
  return Boolean(
    credential &&
    typeof credential === "object" &&
    (credential as Record<string, unknown>).stored === true,
  );
};

const announceSuccess = (result: unknown): void => {
  const suffix = resultStoredCredential(result)
    ? "，调用方凭证已安全保存在主进程内存"
    : "，登录态由 TuneWeave 服务器托管";
  toast.success(`TuneWeave 登录成功${suffix}`);
  window.dispatchEvent(new Event("tuneweave:account-changed"));
};

const passwordLogin = async (): Promise<void> => {
  if (!principal.value.trim() || !password.value) {
    toast.warning("请输入登录账号与密码");
    return;
  }
  passwordLoading.value = true;
  try {
    const result = await loginTuneWeavePassword({
      platform: platform.value,
      principalType: principalType.value,
      principal: principal.value,
      password: password.value,
      passwordFormat: passwordFormat.value,
      countryCode: countryCode.value,
      credentialMode: credentialMode.value,
      account: account.value,
    });
    announceSuccess(result);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    password.value = "";
    passwordLoading.value = false;
  }
};

const createChallenge = async (): Promise<void> => {
  if (!principal.value.trim()) {
    toast.warning("请输入接收验证码的账号");
    return;
  }
  challengeLoading.value = true;
  challengeHint.value = "";
  try {
    const result = await createTuneWeaveChallenge({
      platform: platform.value,
      method: smsMethod.value,
      principal: principal.value,
      countryCode: countryCode.value,
      credentialMode: credentialMode.value,
      account: account.value,
    });
    transactionId.value = result.transaction_id;
    challengeHint.value =
      (typeof result.destination_hint === "string" && result.destination_hint) ||
      "验证码已发送，请在有效期内完成验证";
    toast.success("验证码已发送");
  } catch (error) {
    transactionId.value = "";
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    challengeLoading.value = false;
  }
};

const verifyChallenge = async (): Promise<void> => {
  if (!transactionId.value || !verificationCode.value.trim()) {
    toast.warning("请先发送验证码并输入验证码");
    return;
  }
  verifyLoading.value = true;
  try {
    const result = await verifyTuneWeaveChallenge(transactionId.value, verificationCode.value);
    announceSuccess(result);
    transactionId.value = "";
    challengeHint.value = "";
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    verificationCode.value = "";
    verifyLoading.value = false;
  }
};

watch(mode, () => {
  password.value = "";
  verificationCode.value = "";
  transactionId.value = "";
  challengeHint.value = "";
});

onMounted(() => {
  window.addEventListener("tuneweave:preferences-changed", refreshPreferences);
});

onScopeDispose(() => {
  password.value = "";
  verificationCode.value = "";
  window.removeEventListener("tuneweave:preferences-changed", refreshPreferences);
});
</script>

<template>
  <div
    class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-4 py-4 flex flex-col gap-4"
  >
    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-sm font-semibold text-on-surface">其他登录方式</div>
        <div class="mt-0.5 text-xs text-on-surface-variant/55">
          密码与验证码只用于当前请求，不写入设置、缓存或历史
        </div>
      </div>
      <div class="flex rounded-lg bg-on-surface/6 p-0.5">
        <button
          class="border-none rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors"
          :class="
            mode === 'password'
              ? 'bg-surface text-primary shadow-sm'
              : 'bg-transparent text-on-surface-variant'
          "
          @click="mode = 'password'"
        >
          密码
        </button>
        <button
          class="border-none rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors"
          :class="
            mode === 'sms'
              ? 'bg-surface text-primary shadow-sm'
              : 'bg-transparent text-on-surface-variant'
          "
          @click="mode = 'sms'"
        >
          验证码
        </button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-3">
      <label class="flex flex-col gap-1.5">
        <span class="text-xs text-on-surface-variant">平台</span>
        <select
          v-model="platform"
          class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
        >
          <option value="netease">网易云音乐</option>
          <option value="qq">QQ 音乐</option>
          <option value="kugou">酷狗音乐</option>
          <option value="bilibili">哔哩哔哩</option>
          <option value="migu">咪咕音乐</option>
          <option value="kuwo">酷我音乐</option>
          <option value="soda">汽水音乐</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-xs text-on-surface-variant">凭证归属</span>
        <select
          v-model="credentialMode"
          class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
        >
          <option value="server">服务器托管</option>
          <option value="client">客户端会话</option>
          <option value="both">两者同时</option>
        </select>
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-xs text-on-surface-variant">账户别名</span>
        <input
          v-model="account"
          :disabled="credentialMode === 'client'"
          class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface disabled:op-45"
          placeholder="default"
        />
      </label>
    </div>

    <template v-if="mode === 'password'">
      <div class="grid grid-cols-[120px_minmax(0,1fr)_100px] gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">账号类型</span>
          <select
            v-model="principalType"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
          >
            <option value="phone">手机号</option>
            <option value="email">邮箱</option>
            <option value="username">用户名</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">登录账号</span>
          <input
            v-model="principal"
            autocomplete="username"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">国家区号</span>
          <input
            v-model="countryCode"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            placeholder="86"
          />
        </label>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_180px_auto] gap-3 items-end">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            @keyup.enter="passwordLogin"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">密码格式（可选）</span>
          <input
            v-model="passwordFormat"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            placeholder="平台要求时填写"
          />
        </label>
        <SButton type="primary" :loading="passwordLoading" @click="passwordLogin">
          <template #icon><IconLucideKeyRound /></template>
          登录
        </SButton>
      </div>
    </template>

    <template v-else>
      <div class="grid grid-cols-[120px_minmax(0,1fr)_100px_auto] gap-3 items-end">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">验证方式</span>
          <select
            v-model="smsMethod"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
          >
            <option value="sms">短信</option>
            <option value="email">邮箱</option>
          </select>
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">接收账号</span>
          <input
            v-model="principal"
            autocomplete="username"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">国家区号</span>
          <input
            v-model="countryCode"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            placeholder="86"
          />
        </label>
        <SButton
          variant="secondary"
          type="primary"
          :loading="challengeLoading"
          @click="createChallenge"
        >
          发送验证码
        </SButton>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">验证码</span>
          <input
            v-model="verificationCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            :placeholder="challengeHint || '发送后输入验证码'"
            @keyup.enter="verifyChallenge"
          />
        </label>
        <SButton
          type="primary"
          :loading="verifyLoading"
          :disabled="!transactionId"
          @click="verifyChallenge"
        >
          <template #icon><IconLucideMessageSquareCode /></template>
          验证并登录
        </SButton>
      </div>
      <div v-if="challengeHint" class="text-xs text-on-surface-variant/55">
        {{ challengeHint }}
      </div>
    </template>
  </div>
</template>
