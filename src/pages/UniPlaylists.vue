<script setup lang="ts">
import type { Track } from "@shared/types/player";
import * as player from "@/core/player";
import {
  addTuneWeaveUniItems,
  createTuneWeaveUniPlaylist,
  deleteTuneWeaveUniItem,
  deleteTuneWeaveUniPlaylist,
  exportTuneWeaveUniPlaylist,
  listTuneWeaveUniItems,
  listTuneWeaveUniPlaylists,
  tuneWeaveUniItemToTrack,
  type TuneWeaveUniItem,
  type TuneWeaveUniPlaylist,
} from "@/apis/uni/tuneweave";
import { toast } from "@/composables/useToast";
import { useFloatingPlayerBar } from "@/composables/useFloatingPlayerBar";
import IconLucideDownload from "~icons/lucide/download";
import IconLucideListMusic from "~icons/lucide/list-music";
import IconLucideListPlus from "~icons/lucide/list-plus";
import IconLucideMusic2 from "~icons/lucide/music-2";
import IconLucidePackageOpen from "~icons/lucide/package-open";
import IconLucidePlay from "~icons/lucide/play";
import IconLucidePlus from "~icons/lucide/plus";
import IconLucideTrash2 from "~icons/lucide/trash-2";
import IconLucideX from "~icons/lucide/x";

const { isFloatingBar } = useFloatingPlayerBar();
const loading = ref(false);
const itemLoading = ref(false);
const creating = ref(false);
const adding = ref(false);
const playlists = shallowRef<TuneWeaveUniPlaylist[]>([]);
const items = shallowRef<TuneWeaveUniItem[]>([]);
const selectedRef = ref("");
const createOpen = ref(false);
const createName = ref("");
const createDescription = ref("");
const addRef = ref("");
const addKind = ref("track");

const selected = computed(
  () => playlists.value.find((playlist) => playlist.ref === selectedRef.value) ?? null,
);

const itemTitle = (item: TuneWeaveUniItem): string => {
  const track = tuneWeaveUniItemToTrack(item);
  if (track) return track.title;
  const snapshot = item.snapshot ?? item.metadata ?? item.resource;
  if (snapshot) {
    for (const key of ["name", "title"]) {
      const value = snapshot[key];
      if (typeof value === "string" && value) return value;
    }
  }
  return item.ref;
};

const itemSubtitle = (item: TuneWeaveUniItem): string => {
  const track = tuneWeaveUniItemToTrack(item);
  if (track) return track.artists.map((artist) => artist.name).join(" / ");
  return `${item.kind} · ${item.ref}`;
};

const itemCover = (item: TuneWeaveUniItem): string | undefined =>
  tuneWeaveUniItemToTrack(item)?.cover;

const loadItems = async (playlistRef: string): Promise<void> => {
  itemLoading.value = true;
  try {
    items.value = await listTuneWeaveUniItems(playlistRef);
  } catch (error) {
    items.value = [];
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    itemLoading.value = false;
  }
};

const selectPlaylist = async (playlist: TuneWeaveUniPlaylist): Promise<void> => {
  selectedRef.value = playlist.ref;
  await loadItems(playlist.ref);
};

const loadPlaylists = async (): Promise<void> => {
  loading.value = true;
  try {
    const result = await listTuneWeaveUniPlaylists();
    playlists.value = result;
    if (result.length === 0) {
      selectedRef.value = "";
      items.value = [];
      return;
    }
    const current = result.find((playlist) => playlist.ref === selectedRef.value) ?? result[0];
    await selectPlaylist(current);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
};

const createPlaylist = async (): Promise<void> => {
  const name = createName.value.trim();
  if (!name) {
    toast.warning("请输入歌单名称");
    return;
  }
  creating.value = true;
  try {
    const created = await createTuneWeaveUniPlaylist(name, createDescription.value.trim());
    createOpen.value = false;
    createName.value = "";
    createDescription.value = "";
    await loadPlaylists();
    const current = playlists.value.find((playlist) => playlist.ref === created.ref);
    if (current) await selectPlaylist(current);
    toast.success("Uni Playlist 已创建");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    creating.value = false;
  }
};

const removePlaylist = async (): Promise<void> => {
  if (!selected.value) return;
  try {
    await deleteTuneWeaveUniPlaylist(selected.value.ref);
    toast.success("Uni Playlist 已删除");
    await loadPlaylists();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
};

const addItem = async (): Promise<void> => {
  if (!selected.value) return;
  const ref = addRef.value.trim();
  if (!ref.includes(":")) {
    toast.warning("请输入完整 TuneWeave 资源引用，例如 qq:0039MnYb0qxYhV");
    return;
  }
  adding.value = true;
  try {
    await addTuneWeaveUniItems(selected.value.ref, [{ ref, kind: addKind.value }]);
    addRef.value = "";
    await loadItems(selected.value.ref);
    toast.success("资源已追加");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    adding.value = false;
  }
};

const removeItem = async (item: TuneWeaveUniItem): Promise<void> => {
  if (!selected.value) return;
  try {
    await deleteTuneWeaveUniItem(selected.value.ref, item.item_id);
    items.value = items.value.filter((candidate) => candidate.item_id !== item.item_id);
    toast.success("项目已删除");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
};

const playItem = async (item: TuneWeaveUniItem): Promise<void> => {
  const track = tuneWeaveUniItemToTrack(item);
  if (!track) {
    toast.warning("当前 SPlayer 音频核心暂只播放 Uni Playlist 中的 track 项目");
    return;
  }
  await player.playNow(track);
};

const playAll = async (): Promise<void> => {
  const tracks = items.value
    .map(tuneWeaveUniItemToTrack)
    .filter((track): track is Track => track !== null);
  if (tracks.length === 0) {
    toast.warning("当前歌单没有可播放曲目");
    return;
  }
  await player.playFrom(tracks, 0);
};

const exportPlaylist = async (): Promise<void> => {
  if (!selected.value) return;
  try {
    const document = await exportTuneWeaveUniPlaylist(selected.value.ref);
    const blob = new Blob([JSON.stringify(document, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${selected.value.name || "uni-playlist"}.tuneweave.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
};

onMounted(() => {
  void loadPlaylists();
});
</script>

<template>
  <div class="h-full overflow-hidden">
    <div class="h-full flex" :class="isFloatingBar ? 'pb-24' : ''">
      <aside
        class="w-72 shrink-0 border-r border-r-solid border-outline-variant/15 px-4 py-5 flex flex-col gap-4"
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <h1 class="text-lg font-semibold text-on-surface">Uni Playlist</h1>
            <p class="mt-0.5 text-xs text-on-surface-variant/55">TuneWeave 跨平台有序歌单</p>
          </div>
          <SButton circle size="small" type="primary" @click="createOpen = true">
            <template #icon><IconLucidePlus /></template>
          </SButton>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center">
          <SLoading class="size-6 text-primary" />
        </div>
        <div v-else class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
          <button
            v-for="playlist in playlists"
            :key="playlist.ref"
            class="w-full border-none rounded-lg px-3 py-2.5 text-left cursor-pointer transition-colors flex items-center gap-3"
            :class="
              playlist.ref === selectedRef
                ? 'bg-primary/12 text-primary'
                : 'bg-transparent text-on-surface hover:bg-on-surface/6'
            "
            @click="selectPlaylist(playlist)"
          >
            <div
              class="size-9 shrink-0 rounded-lg bg-on-surface/8 overflow-hidden flex items-center justify-center"
            >
              <SImg
                v-if="playlist.cover_url"
                :src="playlist.cover_url"
                :alt="playlist.name"
                class="size-full"
              />
              <IconLucideListMusic v-else class="size-4.5 text-on-surface-variant/50" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ playlist.name }}</div>
              <div class="mt-0.5 truncate text-xs opacity-55">
                {{ playlist.item_count ?? "—" }} 项 · {{ playlist.ref }}
              </div>
            </div>
          </button>
          <div
            v-if="playlists.length === 0"
            class="flex flex-1 flex-col items-center justify-center gap-2 text-on-surface-variant/45"
          >
            <IconLucideListPlus class="size-8" />
            <span class="text-sm">还没有 Uni Playlist</span>
          </div>
        </div>
      </aside>

      <main class="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div v-if="selected" class="mx-auto max-w-5xl flex flex-col gap-5">
          <header class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="text-xs text-primary">{{ selected.ref }}</div>
              <h2 class="mt-1 truncate text-2xl font-bold text-on-surface">{{ selected.name }}</h2>
              <p class="mt-1 text-sm text-on-surface-variant/60">
                {{ selected.description || "跨平台内容与播放来源相互独立" }}
              </p>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <SButton type="primary" :disabled="items.length === 0" @click="playAll">
                <template #icon><IconLucidePlay /></template>
                播放全部
              </SButton>
              <SButton variant="secondary" @click="exportPlaylist">
                <template #icon><IconLucideDownload /></template>
                导出
              </SButton>
              <SButton variant="secondary" type="error" @click="removePlaylist">
                <template #icon><IconLucideTrash2 /></template>
                删除歌单
              </SButton>
            </div>
          </header>

          <div
            class="rounded-xl bg-surface-panel border border-solid border-outline-variant/15 p-3"
          >
            <div class="flex items-center gap-2">
              <select
                v-model="addKind"
                class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
              >
                <option value="track">歌曲</option>
                <option value="video">视频</option>
                <option value="episode">播客节目</option>
                <option value="radio">广播</option>
              </select>
              <input
                v-model="addRef"
                class="h-9 min-w-0 flex-1 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
                placeholder="完整资源引用，例如 netease:1859245776"
                @keyup.enter="addItem"
              />
              <SButton type="primary" :loading="adding" @click="addItem">追加资源</SButton>
            </div>
          </div>

          <div v-if="itemLoading" class="flex min-h-64 items-center justify-center">
            <SLoading class="size-7 text-primary" />
          </div>
          <div v-else class="flex flex-col gap-1.5">
            <div
              v-for="(item, index) in items"
              :key="item.item_id"
              class="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-on-surface/5"
            >
              <span
                class="w-7 shrink-0 text-center text-xs tabular-nums text-on-surface-variant/40"
              >
                {{ String(index + 1).padStart(2, "0") }}
              </span>
              <div
                class="size-11 shrink-0 rounded-lg bg-on-surface/8 overflow-hidden flex items-center justify-center"
              >
                <SImg
                  v-if="itemCover(item)"
                  :src="itemCover(item)"
                  :alt="itemTitle(item)"
                  class="size-full"
                />
                <IconLucideMusic2 v-else class="size-5 text-on-surface-variant/45" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-on-surface">
                  {{ itemTitle(item) }}
                </div>
                <div class="mt-0.5 truncate text-xs text-on-surface-variant/50">
                  {{ itemSubtitle(item) }}
                </div>
              </div>
              <STag size="small" type="default">{{ item.kind }}</STag>
              <SButton
                v-if="item.kind === 'track'"
                circle
                size="small"
                variant="tertiary"
                @click="playItem(item)"
              >
                <template #icon><IconLucidePlay /></template>
              </SButton>
              <SButton
                circle
                size="small"
                variant="tertiary"
                type="error"
                @click="removeItem(item)"
              >
                <template #icon><IconLucideX /></template>
              </SButton>
            </div>
            <div
              v-if="items.length === 0"
              class="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-on-surface/12 text-on-surface-variant/45"
            >
              <IconLucidePackageOpen class="size-8" />
              <span class="text-sm">歌单中还没有项目</span>
            </div>
          </div>
        </div>

        <div
          v-else
          class="h-full flex flex-col items-center justify-center gap-3 text-on-surface-variant/45"
        >
          <IconLucideListMusic class="size-10" />
          <span>选择或创建一个 Uni Playlist</span>
        </div>
      </main>
    </div>

    <SDialog v-model:open="createOpen" title="创建 Uni Playlist" width="420px">
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">名称</span>
          <input
            v-model="createName"
            class="h-9 rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 text-sm text-on-surface"
            maxlength="200"
            @keyup.enter="createPlaylist"
          />
        </label>
        <label class="flex flex-col gap-1.5">
          <span class="text-xs text-on-surface-variant">描述</span>
          <textarea
            v-model="createDescription"
            class="min-h-24 resize-y rounded-lg border border-solid border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface"
            maxlength="2000"
          />
        </label>
      </div>
      <template #footer="{ close }">
        <SButton variant="secondary" @click="close">取消</SButton>
        <SButton type="primary" :loading="creating" @click="createPlaylist">创建</SButton>
      </template>
    </SDialog>
  </div>
</template>
