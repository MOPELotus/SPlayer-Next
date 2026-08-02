<script setup lang="ts">
import type { DropdownMenuItem } from "@/components/ui/SDropdownMenu.vue";
import type { Track, TrackSource } from "@shared/types/player";
import {
  fetchTuneWeaveCloudTracks,
  type TuneWeaveCloudItem,
} from "@/apis/account/tuneweaveLibrary";
import { useUserStore } from "@/stores/user";
import SongList from "@/components/list/SongList.vue";
import { toast } from "@/composables/useToast";
import { getTuneWeavePreferences } from "@/services/tuneweave";
import { formatFileSize } from "@/utils/format";
import * as player from "@/core/player";
import IconLucideRefreshCw from "~icons/lucide/refresh-cw";
import IconLucideListChecks from "~icons/lucide/list-checks";
import IconLucideCloud from "~icons/lucide/cloud";
import IconLucideHardDrive from "~icons/lucide/hard-drive";
import IconLucideCloudUpload from "~icons/lucide/cloud-upload";

const { t } = useI18n();
const user = useUserStore();

const initialSource = getTuneWeavePreferences().enabled ? "tuneweave" : "netease";
const cloudSource = ref<"netease" | "tuneweave">(initialSource);
const tuneweaveItems = shallowRef<TuneWeaveCloudItem[]>([]);
const tuneweaveLoading = ref(false);
const tuneweaveLoaded = ref(false);
const tuneweaveError = ref("");

/** 上传弹窗 */
const uploadDialogOpen = ref(false);
const searchQuery = ref("");

const sourceTabs = [
  { key: "netease", label: "NCM" },
  { key: "tuneweave", label: "TuneWeave" },
];

const activeTracks = computed<Track[]>(() =>
  cloudSource.value === "tuneweave"
    ? tuneweaveItems.value.map((item) => item.track)
    : user.cloudTracks,
);

const activeSource = computed<TrackSource>(() => activeTracks.value[0]?.source ?? "netease");
const activeLoading = computed(() =>
  cloudSource.value === "tuneweave" ? tuneweaveLoading.value : user.cloudLoading,
);
const activeAvailable = computed(() =>
  cloudSource.value === "tuneweave" ? true : user.isLoggedIn,
);
const activeError = computed(() => (cloudSource.value === "tuneweave" ? tuneweaveError.value : ""));

/** 已用容量百分比 */
const usagePercent = computed(() => {
  if (cloudSource.value === "tuneweave" || user.cloudMaxSize <= 0) return 0;
  return Math.min(100, Math.round((user.cloudSize / user.cloudMaxSize) * 100));
});

const tuneweaveCloudSize = computed(() =>
  tuneweaveItems.value.reduce((total, item) => total + (item.fileSize ?? 0), 0),
);

const usageText = computed(() => {
  if (cloudSource.value === "tuneweave") {
    return tuneweaveCloudSize.value > 0 ? formatFileSize(tuneweaveCloudSize.value) : "";
  }
  if (user.cloudMaxSize <= 0) return "";
  return `${formatFileSize(user.cloudSize)} / ${formatFileSize(user.cloudMaxSize)}`;
});

/** 当前曲目数 */
const trackCount = computed(() =>
  cloudSource.value === "tuneweave"
    ? tuneweaveItems.value.length
    : user.cloudCount || user.cloudTracks.length,
);

const loadTuneWeaveCloud = async (force = false): Promise<void> => {
  if (tuneweaveLoading.value || (tuneweaveLoaded.value && !force)) return;
  tuneweaveLoading.value = true;
  tuneweaveError.value = "";
  try {
    tuneweaveItems.value = await fetchTuneWeaveCloudTracks();
    tuneweaveLoaded.value = true;
  } catch (error) {
    tuneweaveError.value = error instanceof Error ? error.message : String(error);
    if (cloudSource.value === "tuneweave") toast.error(tuneweaveError.value);
  } finally {
    tuneweaveLoading.value = false;
  }
};

const handlePlayAll = (): void => {
  if (activeTracks.value.length === 0) return;
  player.playFrom(activeTracks.value, 0);
};

const songListRef = shallowRef<InstanceType<typeof SongList> | null>(null);

const moreMenuItems = computed<DropdownMenuItem[]>(() => [
  { key: "refresh", label: t("common.refreshCache"), icon: markRaw(IconLucideRefreshCw) },
  { key: "batch", label: t("songList.batch.manage"), icon: markRaw(IconLucideListChecks) },
]);

const handleMoreMenu = (key: string): void => {
  if (key === "refresh") {
    if (cloudSource.value === "tuneweave") void loadTuneWeaveCloud(true);
    else user.ensureCloud(true);
  } else if (key === "batch") {
    songListRef.value?.enterBatch();
  }
};

watch(
  cloudSource,
  (source) => {
    searchQuery.value = "";
    if (source === "tuneweave") void loadTuneWeaveCloud();
    else if (user.isLoggedIn) user.ensureCloud();
  },
  { immediate: true },
);

watch(
  () => user.isLoggedIn,
  (loggedIn) => {
    if (loggedIn && cloudSource.value === "netease") user.ensureCloud();
  },
);

const onTuneWeaveAccountChanged = (): void => {
  tuneweaveLoaded.value = false;
  if (cloudSource.value === "tuneweave") void loadTuneWeaveCloud(true);
};

onMounted(() => {
  window.addEventListener("tuneweave:account-changed", onTuneWeaveAccountChanged);
});

onScopeDispose(() => {
  window.removeEventListener("tuneweave:account-changed", onTuneWeaveAccountChanged);
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 顶栏 -->
    <div class="shrink-0 px-5 pb-2">
      <div class="flex items-center justify-between mt-2 mb-4">
        <div class="flex items-baseline gap-4 min-w-0">
          <h1 class="text-3xl font-bold text-on-surface shrink-0 text-balance">
            {{ t("cloud.title") }}
          </h1>
          <div
            v-if="activeAvailable && trackCount > 0"
            class="flex items-center gap-4 text-sm text-on-surface-variant/50 truncate"
          >
            <span class="flex items-center gap-1">
              <IconLucideCloud class="size-3.5" />
              {{ t("common.totalSongs", { count: trackCount }) }}
            </span>
            <span v-if="usageText" class="flex items-center gap-2 min-w-0">
              <IconLucideHardDrive class="size-3.5 shrink-0" />
              <span
                v-if="cloudSource === 'netease'"
                class="relative h-1.5 w-20 rounded-full bg-on-surface/10 overflow-hidden shrink-0"
              >
                <span
                  class="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-300"
                  :style="{ width: `${usagePercent}%` }"
                />
              </span>
              <span class="text-xs truncate">{{ usageText }}</span>
            </span>
          </div>
        </div>
        <div class="w-40 shrink-0">
          <STabs v-model="cloudSource" :tabs="sourceTabs" type="segment" round />
        </div>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <SButton
            type="primary"
            variant="secondary"
            round
            :disabled="activeTracks.length === 0"
            @click="handlePlayAll"
          >
            <template #icon>
              <IconLucidePlay />
            </template>
            {{ t("common.playAll") }}
          </SButton>
          <SButton
            v-if="cloudSource === 'netease'"
            variant="secondary"
            round
            :disabled="!user.isLoggedIn"
            @click="uploadDialogOpen = true"
          >
            <template #icon>
              <IconLucideCloudUpload />
            </template>
            {{ t("cloud.upload.button") }}
          </SButton>
          <SDropdownMenu :items="moreMenuItems" align="start" @select="handleMoreMenu">
            <template #trigger>
              <SButton variant="secondary" circle :disabled="!activeAvailable">
                <template #icon>
                  <IconLucideEllipsis />
                </template>
              </SButton>
            </template>
          </SDropdownMenu>
          <span v-if="cloudSource === 'tuneweave'" class="text-xs text-on-surface-variant/55">
            Beta 暂提供读取与播放；上传、删除待真实账户流程验证后开放
          </span>
        </div>
        <SInput
          v-model="searchQuery"
          :placeholder="t('common.search')"
          clearable
          round
          class="w-40 focus-within:w-56"
        >
          <template #prefix>
            <IconLucideSearch class="size-4 text-on-surface-variant/40 shrink-0" />
          </template>
        </SInput>
      </div>
    </div>
    <!-- 列表 -->
    <Transition name="fade" mode="out-in" :duration="150">
      <!-- 未登录 -->
      <div v-if="!activeAvailable" key="login" class="flex-1 flex items-center justify-center">
        <div class="text-center text-on-surface-variant/50">
          <IconLucideCloud class="size-12 mx-auto mb-3 opacity-30" />
          <div class="text-sm">{{ t("cloud.needLogin") }}</div>
        </div>
      </div>
      <!-- 错误 -->
      <div
        v-else-if="activeError && activeTracks.length === 0"
        key="error"
        class="flex-1 flex items-center justify-center px-6"
      >
        <div class="max-w-md text-center text-on-surface-variant/70">
          <IconLucideCloud class="size-12 mx-auto mb-3 opacity-30" />
          <div class="text-sm break-words">{{ activeError }}</div>
          <SButton class="mt-4" variant="secondary" @click="loadTuneWeaveCloud(true)">
            {{ t("common.retry") }}
          </SButton>
        </div>
      </div>
      <!-- 列表 -->
      <div v-else-if="activeTracks.length > 0" key="list" class="flex-1 min-h-0">
        <SongList
          ref="songListRef"
          :items="activeTracks"
          :search-query="searchQuery"
          :source="activeSource"
          :collection-type="cloudSource === 'netease' ? 'cloud' : undefined"
          :can-remove="cloudSource === 'netease'"
          :show-size="true"
          enable-sort
        />
      </div>
      <!-- 加载中 -->
      <div v-else-if="activeLoading" key="loading" class="flex-1 flex items-center justify-center">
        <div class="text-center text-on-surface-variant/60">
          <SLoading class="text-4xl text-primary/70 mb-4 mx-auto block" />
          <div class="text-sm">{{ t("common.loading") }}</div>
        </div>
      </div>
      <!-- 空 -->
      <div v-else key="empty" class="flex-1 flex items-center justify-center">
        <div class="text-center text-on-surface-variant/50">
          <IconLucideCloud class="size-12 mx-auto mb-3 opacity-30" />
          <div class="text-sm">{{ t("cloud.empty") }}</div>
        </div>
      </div>
    </Transition>
    <CloudUploadDialog v-if="cloudSource === 'netease'" v-model:open="uploadDialogOpen" />
  </div>
</template>
