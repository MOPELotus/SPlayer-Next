<script setup lang="ts">
import { renderSVG } from "uqr";
import type { TuneWeaveQrTransaction } from "@shared/types/tuneweave";
import {
  checkTuneWeaveHealth,
  clearTuneWeaveCredentials,
  getTuneWeaveStatus,
  tuneweaveData,
} from "@/apis/tuneweave";
import {
  ensureTuneWeaveConfigured,
  getTuneWeavePreferences,
  setTuneWeavePreferences,
  type TuneWeaveCredentialMode,
} from "@/services/tuneweave";
import TuneWeaveAccountPanel from "./TuneWeaveAccountPanel.vue";
import { toast } from "@/composables/useToast";

defineOptions({ inheritAttrs: false });

const form = reactive(getTuneWeavePreferences());
const testing = ref(false);
const connected = ref(false);
const credentialCount = ref(0);

const qrOpen = ref(false);
const qrLoading = ref(false);
const qrPlatform = ref(form.accountPlatform || "qq");
const qrLoginType = ref(qrPlatform.value === "qq" ? "qq_music" : "");
const qrMode = ref<TuneWeaveCredentialMode>(form.credentialMode);
const qrTransactionId = ref("");
const qrStatus = ref("idle");
const qrImage = ref("");
const qrMessage = ref("");

const readString = (value: unknown, keys: string[]): string => {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  const nested = record.qr;
  if (nested && typeof nested === "object") return readString(nested, keys);
  return "";
};

const credentialWasStored = (transaction: TuneWeaveQrTransaction): boolean => {
  const credential = transaction.caller_credential;
  return Boolean(
    credential &&
      typeof credential === "object" &&
      (credential as Record<string, unknown>).stored === true,
  );
};

const renderQr = (transaction: TuneWeaveQrTransaction): void => {
  const directImage = readString(transaction, [
    "qr_image",
    "qr_image_url",
    "image_url",
    "data_url",
    "image",
  ]);
  if (directImage) {
    qrImage.value = directImage.startsWith("data:") || /^https?:\/\//i.test(directImage)
      ? directImage
      : `data:image/png;base64,${directImage}`;
    return;
  }
  const content = readString(transaction, ["qr_content", "content", "qr_url", "url"]);
  if (!content) {
    qrImage.value = "";
    return;
  }
  const svg = renderSVG(content, {
    ecc: "H",
    border: 2,
    pixelSize: 8,
    whiteColor: "#ffffff",
    blackColor: "#000000",
  });
  qrImage.value = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const refreshStatus = async (): Promise<void> => {
  const status = await getTuneWeaveStatus();
  credentialCount.value = status.credentialCount;
};

const persist = async (): Promise<void> => {
  const next = setTuneWeavePreferences({
    enabled: form.enabled,
    baseUrl: form.baseUrl,
    accountPlatform: form.accountPlatform,
    account: form.account,
    credentialMode: form.credentialMode,
    fallbackToBuiltIn: form.fallbackToBuiltIn,
    playbackFallback: form.playbackFallback,
    playbackPlatform: form.playbackPlatform,
    fallbackPlatforms: form.fallbackPlatforms,
  });
  Object.assign(form, next);
  await ensureTuneWeaveConfigured();
};

const testConnection = async (): Promise<void> => {
  testing.value = true;
  try {
    await persist();
    await checkTuneWeaveHealth();
    await refreshStatus();
    connected.value = true;
    toast.success("TuneWeave 连接正常");
  } catch (error) {
    connected.value = false;
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    testing.value = false;
  }
};

const clearCredentials = async (): Promise<void> => {
  await clearTuneWeaveCredentials();
  await refreshStatus();
  window.dispatchEvent(new Event("tuneweave:account-changed"));
  toast.success("已清除本次应用会话中的 TuneWeave 调用方凭证");
};

const applyQrResult = async (transaction: TuneWeaveQrTransaction): Promise<void> => {
  qrStatus.value = String(transaction.status ?? qrStatus.value);
  renderQr(transaction);
  await refreshStatus();
  if (qrStatus.value === "confirmed") {
    pausePolling();
    qrMessage.value = credentialWasStored(transaction)
      ? "登录成功，调用方凭证已由主进程安全保存在内存中"
      : "登录成功，登录态已由 TuneWeave 服务器托管";
    window.dispatchEvent(new Event("tuneweave:account-changed"));
    toast.success("TuneWeave 登录成功");
  } else if (qrStatus.value === "scanned") {
    qrMessage.value = "已扫码，请在手机上确认";
  } else if (qrStatus.value === "expired") {
    pausePolling();
    qrMessage.value = "二维码已过期，请重新生成";
  } else if (qrStatus.value === "failed") {
    pausePolling();
    qrMessage.value = "登录失败，请重新生成二维码";
  } else {
    qrMessage.value = "请使用对应平台客户端扫码";
  }
};

const pollQr = async (): Promise<void> => {
  if (!qrTransactionId.value) return;
  try {
    const transaction = await tuneweaveData<TuneWeaveQrTransaction>({
      path: `/v1/auth/qr/${encodeURIComponent(qrTransactionId.value)}`,
      includeCredentials: false,
    });
    await applyQrResult(transaction);
  } catch (error) {
    qrMessage.value = error instanceof Error ? error.message : String(error);
  }
};

const { pause: pausePolling, resume: resumePolling } = useIntervalFn(pollQr, 1500, {
  immediate: false,
});

const startQr = async (): Promise<void> => {
  qrLoading.value = true;
  pausePolling();
  qrTransactionId.value = "";
  qrImage.value = "";
  qrStatus.value = "creating";
  qrMessage.value = "正在创建登录事务…";
  try {
    await persist();
    const body: Record<string, unknown> = {
      platform: qrPlatform.value.trim(),
      credential_mode: qrMode.value,
    };
    if (qrLoginType.value.trim()) body.login_type = qrLoginType.value.trim();
    if (qrMode.value !== "client") body.account = form.account.trim() || "default";
    const transaction = await tuneweaveData<TuneWeaveQrTransaction>({
      method: "POST",
      path: "/v1/auth/qr",
      body,
      includeCredentials: false,
    });
    qrTransactionId.value = transaction.transaction_id;
    if (!qrTransactionId.value) throw new Error("TuneWeave 未返回二维码事务 ID");
    await applyQrResult(transaction);
    if (!["confirmed", "expired", "failed"].includes(qrStatus.value)) resumePolling();
  } catch (error) {
    qrStatus.value = "failed";
    qrMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    qrLoading.value = false;
  }
};

const openQr = (): void => {
  qrPlatform.value = form.accountPlatform;
  qrLoginType.value = qrPlatform.value === "qq" ? "qq_music" : "";
  qrMode.value = form.credentialMode;
  qrOpen.value = true;
};

watch(qrOpen, (open) => {
  if (!open) {
    pausePolling();
    qrTransactionId.value = "";
    qrImage.value = "";
    qrStatus.value = "idle";
    qrMessage.value = "";
  }
});

onMounted(() => {
  void ensureTuneWeaveConfigured().then(refreshStatus).catch(() => {});
});

onScopeDispose(pausePolling);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-4 py-4 flex flex-col gap-3"
    >
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-on-surface">TuneWeave 原生后端</div>
          <div class="text-xs text-on-surface-variant/60 mt-0.5">
            搜索、播放、下载、推荐与歌词优先经 TuneWeave；调用方凭证仅驻留主进程内存
          </div>
        </div>
        <SSwitch v-model="form.enabled" @update:model-value="persist" />
      </div>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs text-on-surface-variant">API 地址</span>
        <input
          v-model="form.baseUrl"
          class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
          placeholder="http://127.0.0.1:7832"
          @change="persist"
        />
      </label>

      <div class="grid grid-cols-3 gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">账户平台</span>
          <select
            v-model="form.accountPlatform"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
            @change="persist"
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
          <span class="text-xs text-on-surface-variant">服务器账户别名</span>
          <input
            v-model="form.account"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
            placeholder="default"
            @change="persist"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">凭证归属</span>
          <select
            v-model="form.credentialMode"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
            @change="persist"
          >
            <option value="server">服务器托管</option>
            <option value="client">客户端会话</option>
            <option value="both">两者同时</option>
          </select>
        </label>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div class="text-xs text-on-surface-variant/70">
          {{ connected ? "连接正常" : "尚未验证连接" }} · 主进程会话凭证
          {{ credentialCount }} 份
        </div>
        <div class="flex items-center gap-2">
          <SButton
            v-if="credentialCount > 0"
            variant="secondary"
            size="small"
            type="error"
            @click="clearCredentials"
          >
            清除凭证
          </SButton>
          <SButton variant="secondary" size="small" :disabled="testing" @click="testConnection">
            <template #icon><SLoading v-if="testing" class="size-4" /></template>
            测试连接
          </SButton>
          <SButton variant="secondary" size="small" type="primary" @click="openQr">
            二维码登录
          </SButton>
        </div>
      </div>
    </div>

    <TuneWeaveAccountPanel />

    <SDialog v-model:open="qrOpen" title="TuneWeave 二维码登录" width="420px">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-xs text-on-surface-variant">平台</span>
            <select
              v-model="qrPlatform"
              class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            >
              <option value="qq">QQ 音乐</option>
              <option value="netease">网易云音乐</option>
              <option value="bilibili">哔哩哔哩</option>
              <option value="kugou">酷狗音乐</option>
              <option value="migu">咪咕音乐</option>
              <option value="kuwo">酷我音乐</option>
              <option value="soda">汽水音乐</option>
            </select>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-xs text-on-surface-variant">登录类型</span>
            <input
              v-model="qrLoginType"
              class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
              placeholder="平台可选登录类型"
            />
          </label>
        </div>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">凭证归属</span>
          <select
            v-model="qrMode"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
          >
            <option value="server">服务器托管</option>
            <option value="client">客户端会话</option>
            <option value="both">两者同时</option>
          </select>
        </label>

        <div
          class="mx-auto size-48 rounded-2xl bg-white border border-solid border-outline-variant/20 p-3 flex items-center justify-center overflow-hidden"
        >
          <img v-if="qrImage" :src="qrImage" class="size-full object-contain" alt="QR" />
          <SLoading v-else-if="qrLoading" class="size-7 text-primary" />
          <div v-else class="text-center text-xs text-gray-400 px-4">
            点击下方按钮生成二维码
          </div>
        </div>
        <div class="text-center text-xs text-on-surface-variant min-h-4">{{ qrMessage }}</div>
      </div>

      <template #footer="{ close }">
        <SButton variant="secondary" @click="close">关闭</SButton>
        <SButton type="primary" :disabled="qrLoading" @click="startQr">
          {{ qrTransactionId ? "重新生成" : "生成二维码" }}
        </SButton>
      </template>
    </SDialog>
  </div>
</template>
