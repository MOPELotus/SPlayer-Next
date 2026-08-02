<script setup lang="ts">
import {
  fetchTuneWeaveAccountPlaylists,
  fetchTuneWeaveAccountProfile,
  fetchTuneWeaveFavoriteTracks,
  fetchTuneWeaveMembership,
  fetchTuneWeaveSession,
  logoutTuneWeaveSession,
  refreshTuneWeaveSession,
  type TuneWeaveAccountProfile,
  type TuneWeaveMembership,
  type TuneWeaveSession,
} from "@/apis/account/tuneweave";
import { getTuneWeavePreferences } from "@/services/tuneweave";
import { toast } from "@/composables/useToast";

defineOptions({ inheritAttrs: false });

const loading = ref(false);
const refreshing = ref(false);
const profile = shallowRef<TuneWeaveAccountProfile | null>(null);
const membership = shallowRef<TuneWeaveMembership | null>(null);
const session = shallowRef<TuneWeaveSession | null>(null);
const playlistCount = ref<number | null>(null);
const favoriteCount = ref<number | null>(null);
const errorMessage = ref("");

const pickString = (value: unknown, keys: string[]): string => {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const field = record[key];
    if (typeof field === "string" && field.trim()) return field.trim();
    if (typeof field === "number") return String(field);
  }
  for (const key of ["profile", "user", "account", "data"]) {
    if (record[key] && typeof record[key] === "object") {
      const nested = pickString(record[key], keys);
      if (nested) return nested;
    }
  }
  return "";
};

const pickBoolean = (value: unknown, keys: string[]): boolean | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return null;
};

const preferences = computed(getTuneWeavePreferences);
const displayName = computed(
  () =>
    pickString(profile.value, ["nickname", "display_name", "name", "username"]) ||
    "未读取账户资料",
);
const avatar = computed(() =>
  pickString(profile.value, ["avatar_url", "avatarUrl", "avatar", "picture"]),
);
const userId = computed(() => pickString(profile.value, ["user_id", "userId", "uid", "id"]));
const signature = computed(() =>
  pickString(profile.value, ["signature", "bio", "description", "introduction"]),
);
const sessionStatus = computed(() => {
  const explicit = pickString(session.value, ["status", "state"]);
  if (explicit) return explicit;
  const authenticated = pickBoolean(session.value, ["authenticated", "logged_in", "valid"]);
  if (authenticated === true) return "authenticated";
  if (authenticated === false) return "anonymous";
  return session.value ? "available" : "unknown";
});
const membershipText = computed(
  () =>
    pickString(membership.value, ["name", "level", "tier", "type", "status"]) ||
    (membership.value ? "已读取" : "未知"),
);

const loadAccount = async (): Promise<void> => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [profileResult, membershipResult, sessionResult, playlistsResult, favoritesResult] =
      await Promise.allSettled([
        fetchTuneWeaveAccountProfile(),
        fetchTuneWeaveMembership(),
        fetchTuneWeaveSession(),
        fetchTuneWeaveAccountPlaylists(),
        fetchTuneWeaveFavoriteTracks(),
      ]);
    profile.value = profileResult.status === "fulfilled" ? profileResult.value : null;
    membership.value = membershipResult.status === "fulfilled" ? membershipResult.value : null;
    session.value = sessionResult.status === "fulfilled" ? sessionResult.value : null;
    playlistCount.value =
      playlistsResult.status === "fulfilled" ? playlistsResult.value.length : null;
    favoriteCount.value =
      favoritesResult.status === "fulfilled" ? favoritesResult.value.length : null;

    const failures = [
      profileResult,
      membershipResult,
      sessionResult,
      playlistsResult,
      favoritesResult,
    ].filter((result) => result.status === "rejected");
    if (failures.length === 5) {
      const first = failures[0] as PromiseRejectedResult;
      throw first.reason;
    }
    if (failures.length > 0) errorMessage.value = `${failures.length} 项账户数据暂时不可用`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
};

const refreshSession = async (): Promise<void> => {
  refreshing.value = true;
  try {
    session.value = await refreshTuneWeaveSession();
    toast.success("TuneWeave 会话已刷新");
    await loadAccount();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    refreshing.value = false;
  }
};

const logout = async (): Promise<void> => {
  try {
    await logoutTuneWeaveSession();
    profile.value = null;
    membership.value = null;
    session.value = null;
    playlistCount.value = null;
    favoriteCount.value = null;
    toast.success("已退出 TuneWeave 账户会话");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
};

onMounted(() => {
  void loadAccount();
});
</script>

<template>
  <div
    class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 px-4 py-4 flex flex-col gap-4"
  >
    <div class="flex items-center gap-3">
      <div
        class="size-12 shrink-0 overflow-hidden rounded-full bg-on-surface/8 flex items-center justify-center"
      >
        <SImg v-if="avatar" :src="avatar" :alt="displayName" class="size-full" />
        <IconLucideUserRound v-else class="size-6 text-on-surface-variant/50" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-semibold text-on-surface">{{ displayName }}</div>
        <div class="mt-0.5 truncate text-xs text-on-surface-variant/60">
          {{ preferences.accountPlatform }} · {{ preferences.account }}
          <template v-if="userId"> · {{ userId }}</template>
        </div>
        <div v-if="signature" class="mt-1 truncate text-xs text-on-surface-variant/45">
          {{ signature }}
        </div>
      </div>
      <SLoading v-if="loading" class="size-5 text-primary" />
    </div>

    <div class="grid grid-cols-4 gap-2">
      <div class="rounded-lg bg-on-surface/5 px-3 py-2.5">
        <div class="text-[11px] text-on-surface-variant/55">会话</div>
        <div class="mt-1 truncate text-sm font-medium text-on-surface">{{ sessionStatus }}</div>
      </div>
      <div class="rounded-lg bg-on-surface/5 px-3 py-2.5">
        <div class="text-[11px] text-on-surface-variant/55">会员</div>
        <div class="mt-1 truncate text-sm font-medium text-on-surface">{{ membershipText }}</div>
      </div>
      <div class="rounded-lg bg-on-surface/5 px-3 py-2.5">
        <div class="text-[11px] text-on-surface-variant/55">歌单</div>
        <div class="mt-1 text-sm font-medium tabular-nums text-on-surface">
          {{ playlistCount ?? "—" }}
        </div>
      </div>
      <div class="rounded-lg bg-on-surface/5 px-3 py-2.5">
        <div class="text-[11px] text-on-surface-variant/55">喜欢歌曲</div>
        <div class="mt-1 text-sm font-medium tabular-nums text-on-surface">
          {{ favoriteCount ?? "—" }}
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-h-4 text-xs text-on-surface-variant/60">
        {{ errorMessage }}
      </div>
      <div class="flex items-center gap-2">
        <SButton variant="secondary" size="small" :loading="loading" @click="loadAccount">
          重新读取
        </SButton>
        <SButton
          variant="secondary"
          size="small"
          type="primary"
          :loading="refreshing"
          @click="refreshSession"
        >
          刷新会话
        </SButton>
        <SButton variant="secondary" size="small" type="error" @click="logout">
          退出会话
        </SButton>
      </div>
    </div>
  </div>
</template>
