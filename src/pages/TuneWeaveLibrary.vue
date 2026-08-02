<script setup lang="ts">
import type { Track, TrackSource } from "@shared/types/player";
import { fetchTuneWeaveFavoriteTracks } from "@/apis/account/tuneweave";
import {
  fetchTuneWeaveCloudTracks,
  fetchTuneWeavePlaybackHistory,
  type TuneWeaveCloudItem,
  type TuneWeaveHistoryItem,
} from "@/apis/account/tuneweaveLibrary";
import SongList from "@/components/list/SongList.vue";
import { toast } from "@/composables/useToast";
import * as player from "@/core/player";
import { formatFileSize } from "@/utils/format";
import IconLucideCloud from "~icons/lucide/cloud";
import IconLucideHeart from "~icons/lucide/heart";
import IconLucideHistory from "~icons/lucide/history";
import IconLucideLibraryBig from "~icons/lucide/library-big";
import IconLucideRefreshCw from "~icons/lucide/refresh-cw";

const activeTab = ref<"history" | "cloud" | "favorites">("history");
const loading = ref(false);
const errorMessage = ref("");
const history = shallowRef<TuneWeaveHistoryItem[]>([]);
const cloud = shallowRef<TuneWeaveCloudItem[]>([]);
const favorites = shallowRef<Track[]>([]);

const tabs = computed(() => [
  { key: "history", label: `播放历史 (${history.value.length})` },
  { key: "cloud", label: `云盘 (${cloud.value.length})` },
  { key: "favorites", label: `喜欢歌曲 (${favorites.value.length})` },
]);

const currentTracks = computed<Track[]>(() => {
  if (activeTab.value === "history") return history.value.map((item) => item.track);
  if (activeTab.value === "cloud") return cloud.value.map((item) => item.track);
  return favorites.value;
});

const listSource = computed<TrackSource>(() => currentTracks.value[0]?.source ?? "netease");
const totalHistoryPlays = computed(() =>
  history.value.reduce((total, item) => total + (item.playCount ?? 0), 0),
);
const totalCloudSize = computed(() =>
  cloud.value.reduce((total, item) => total + (item.fileSize ?? 0), 0),
);

const statCards = computed(() => [
  { label: "历史曲目", value: String(history.value.length), icon: markRaw(IconLucideHistory) },
  { label: "累计播放", value: String(totalHistoryPlays.value), icon: markRaw(IconLucideHistory) },
  {
    label: "云盘容量",
    value: totalCloudSize.value > 0 ? formatFileSize(totalCloudSize.value) : "—",
    icon: markRaw(IconLucideCloud),
  },
  { label: "喜欢歌曲", value: String(favorites.value.length), icon: markRaw(IconLucideHeart) },
]);

const loadLibrary = async (): Promise<void> => {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [historyResult, cloudResult, favoritesResult] = await Promise.allSettled([
      fetchTuneWeavePlaybackHistory(),
      fetchTuneWeaveCloudTracks(),
      fetchTuneWeaveFavoriteTracks(),
    ]);
    history.value = historyResult.status === "fulfilled" ? historyResult.value : [];
    cloud.value = cloudResult.status === "fulfilled" ? cloudResult.value : [];
    favorites.value = favoritesResult.status === "fulfilled" ? favoritesResult.value : [];

    const failures = [historyResult, cloudResult, favoritesResult].filter(
      (result) => result.status === "rejected",
    );
    if (failures.length === 3) {
      const first = failures[0] as PromiseRejectedResult;
      throw first.reason;
    }
    if (failures.length > 0) errorMessage.value = `${failures.length} 项账户资料暂时不可用`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    toast.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
};

const playAll = async (): Promise<void> => {
  if (currentTracks.value.length === 0) {
    toast.warning("当前列表没有可播放曲目");
    return;
  }
  await player.playFrom(currentTracks.value, 0);
};

const onAccountChanged = (): void => {
  void loadLibrary();
};

onMounted(() => {
  window.addEventListener("tuneweave:account-changed", onAccountChanged);
  void loadLibrary();
});

onScopeDispose(() => {
  window.removeEventListener("tuneweave:account-changed", onAccountChanged);
});
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="shrink-0 px-6 pt-4 pb-3">
      <div class="flex items-start justify-between gap-5">
        <div class="flex min-w-0 items-center gap-4">
          <div
            class="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary"
          >
            <IconLucideLibraryBig class="size-7" />
          </div>
          <div class="min-w-0">
            <h1 class="text-3xl font-bold text-on-surface">TuneWeave 资料库</h1>
            <p class="mt-1 text-sm text-on-surface-variant/65">
              当前账户平台的播放历史、云盘与喜欢歌曲
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <SButton
            variant="secondary"
            round
            :disabled="currentTracks.length === 0"
            @click="playAll"
          >
            <template #icon><IconLucidePlay /></template>
            播放全部
          </SButton>
          <SButton variant="secondary" circle :loading="loading" @click="loadLibrary">
            <template #icon><IconLucideRefreshCw /></template>
          </SButton>
        </div>
      </div>

      <div class="mt-5 grid grid-cols-4 gap-3">
        <SCard v-for="stat in statCards" :key="stat.label" size="small" radius="lg">
          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <component :is="stat.icon" class="size-4.5" />
            </div>
            <div class="min-w-0">
              <div class="text-xs text-on-surface-variant/55">{{ stat.label }}</div>
              <div class="mt-0.5 truncate text-lg font-semibold tabular-nums text-on-surface">
                {{ stat.value }}
              </div>
            </div>
          </div>
        </SCard>
      </div>

      <div class="mt-4 flex items-center justify-between gap-4">
        <STabs v-model="activeTab" :tabs="tabs" />
        <span v-if="errorMessage" class="text-xs text-amber-600">{{ errorMessage }}</span>
      </div>
    </div>

    <div v-if="loading && currentTracks.length === 0" class="flex flex-1 items-center justify-center">
      <div class="text-center text-on-surface-variant/60">
        <SLoading class="mx-auto mb-4 block text-4xl text-primary/70" />
        <div class="text-sm">正在读取 TuneWeave 账户资料…</div>
      </div>
    </div>

    <div
      v-else-if="currentTracks.length === 0"
      class="flex flex-1 items-center justify-center text-on-surface-variant/50"
    >
      <div class="text-center">
        <IconLucideLibraryBig class="mx-auto mb-3 size-12 opacity-30" />
        <div class="text-sm">当前分类没有可显示的曲目</div>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1">
      <SongList
        :items="currentTracks"
        :source="listSource"
        :show-size="activeTab === 'cloud'"
        :show-album="true"
        :show-duration="true"
      />
    </div>
  </div>
</template>
