import type { Track } from "@shared/types/player";
import type { Platform } from "@shared/types/platform";
import { tuneweaveData } from "@/apis/tuneweave";
import {
  fromTuneWeavePlatform,
  tuneWeaveRefId,
  tuneWeaveTrackToTrack,
} from "@/utils/format/tuneweave";

export interface TuneWeaveUniPlaylist {
  ref: string;
  id?: string;
  name: string;
  description?: string | null;
  item_count?: number | null;
  cover_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface TuneWeaveUniItem {
  item_id: string;
  kind: string;
  ref: string;
  snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  resource?: Record<string, unknown> | null;
  [key: string]: unknown;
}

const arraysFrom = (payload: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
};

const unwrap = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.data && typeof record.data === "object") {
    return record.data as Record<string, unknown>;
  }
  return record;
};

const stringField = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
};

const numberField = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

const normalizePlaylist = (value: unknown): TuneWeaveUniPlaylist | null => {
  const record = unwrap(value);
  if (!record) return null;
  const ref = stringField(record, ["ref", "playlist_ref", "reference"]);
  const id = stringField(record, ["id", "playlist_id"]) || tuneWeaveRefId(ref);
  const name = stringField(record, ["name", "title"]);
  if (!ref && !id) return null;
  return {
    ...record,
    ref: ref || `uni:${id}`,
    id: id || undefined,
    name: name || "未命名 Uni Playlist",
    description: stringField(record, ["description", "desc"]) || null,
    item_count: numberField(record, ["item_count", "track_count", "count"]),
    cover_url: stringField(record, ["cover_url", "cover", "pic_url"]) || null,
  };
};

const normalizeItem = (value: unknown): TuneWeaveUniItem | null => {
  const record = unwrap(value);
  if (!record) return null;
  const itemId = stringField(record, ["item_id", "id"]);
  const ref = stringField(record, ["ref", "resource_ref", "reference"]);
  const kind = stringField(record, ["kind", "type"]);
  if (!itemId || !ref) return null;
  return {
    ...record,
    item_id: itemId,
    ref,
    kind: kind || "track",
    snapshot:
      record.snapshot && typeof record.snapshot === "object"
        ? (record.snapshot as Record<string, unknown>)
        : null,
    metadata:
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : null,
    resource:
      record.resource && typeof record.resource === "object"
        ? (record.resource as Record<string, unknown>)
        : null,
  };
};

export const listTuneWeaveUniPlaylists = async (limit = 100): Promise<TuneWeaveUniPlaylist[]> => {
  const data = await tuneweaveData<unknown>({
    path: "/v1/uni/playlists",
    query: { limit },
  });
  return arraysFrom(data, ["items", "playlists", "results"])
    .map(normalizePlaylist)
    .filter((item): item is TuneWeaveUniPlaylist => item !== null);
};

export const createTuneWeaveUniPlaylist = async (
  name: string,
  description = "",
): Promise<TuneWeaveUniPlaylist> => {
  const data = await tuneweaveData<unknown>({
    method: "POST",
    path: "/v1/uni/playlists",
    body: { name, description },
  });
  const playlist = normalizePlaylist(data);
  if (!playlist) throw new Error("TuneWeave 未返回有效的 Uni Playlist");
  return playlist;
};

export const updateTuneWeaveUniPlaylist = async (
  ref: string,
  update: { name?: string; description?: string },
): Promise<TuneWeaveUniPlaylist> => {
  const data = await tuneweaveData<unknown>({
    method: "PATCH",
    path: `/v1/uni/playlists/${encodeURIComponent(ref)}`,
    body: update,
  });
  const playlist = normalizePlaylist(data);
  if (!playlist) throw new Error("TuneWeave 未返回有效的 Uni Playlist");
  return playlist;
};

export const deleteTuneWeaveUniPlaylist = async (ref: string): Promise<void> => {
  await tuneweaveData<unknown>({
    method: "DELETE",
    path: `/v1/uni/playlists/${encodeURIComponent(ref)}`,
  });
};

export const listTuneWeaveUniItems = async (
  ref: string,
  limit = 500,
): Promise<TuneWeaveUniItem[]> => {
  const data = await tuneweaveData<unknown>({
    path: `/v1/uni/playlists/${encodeURIComponent(ref)}/items`,
    query: { limit },
  });
  return arraysFrom(data, ["items", "results", "resources"])
    .map(normalizeItem)
    .filter((item): item is TuneWeaveUniItem => item !== null);
};

export const addTuneWeaveUniItems = async (
  playlistRef: string,
  items: Array<{ ref: string; kind: string }>,
): Promise<void> => {
  await tuneweaveData<unknown>({
    method: "POST",
    path: `/v1/uni/playlists/${encodeURIComponent(playlistRef)}/items`,
    body: { items },
  });
};

export const deleteTuneWeaveUniItem = async (
  playlistRef: string,
  itemId: string,
): Promise<void> => {
  await tuneweaveData<unknown>({
    method: "DELETE",
    path: `/v1/uni/playlists/${encodeURIComponent(playlistRef)}/items/${encodeURIComponent(itemId)}`,
  });
};

export const exportTuneWeaveUniPlaylist = async (ref: string): Promise<unknown> =>
  tuneweaveData<unknown>({
    path: `/v1/uni/playlists/${encodeURIComponent(ref)}/export`,
  });

const itemSnapshot = (item: TuneWeaveUniItem): Record<string, unknown> => ({
  ...(item.metadata ?? {}),
  ...(item.snapshot ?? {}),
  ...(item.resource ?? {}),
});

export const tuneWeaveUniItemToTrack = (item: TuneWeaveUniItem): Track | null => {
  if (item.kind !== "track") return null;
  const platformName = item.ref.split(":", 1)[0] || "netease";
  const fallbackPlatform: Platform = fromTuneWeavePlatform(platformName, "netease");
  const snapshot = itemSnapshot(item);
  const artistsRaw = Array.isArray(snapshot.artists) ? snapshot.artists : [];
  const albumRaw =
    snapshot.album && typeof snapshot.album === "object"
      ? (snapshot.album as Record<string, unknown>)
      : null;
  return tuneWeaveTrackToTrack(
    {
      ref: item.ref,
      platform: platformName,
      id: tuneWeaveRefId(item.ref) ?? item.ref,
      name: stringField(snapshot, ["name", "title"]) || item.ref,
      aliases: Array.isArray(snapshot.aliases)
        ? snapshot.aliases.filter((value): value is string => typeof value === "string")
        : [],
      artists: artistsRaw
        .map(unwrap)
        .filter((artist): artist is Record<string, unknown> => artist !== null)
        .map((artist) => ({
          ref: stringField(artist, ["ref", "reference"]) || undefined,
          id: stringField(artist, ["id"]) || undefined,
          name: stringField(artist, ["name", "title"]) || "未知歌手",
          avatar_url: stringField(artist, ["avatar_url", "avatar"]) || null,
        })),
      album: albumRaw
        ? {
            ref: stringField(albumRaw, ["ref", "reference"]) || undefined,
            id: stringField(albumRaw, ["id"]) || undefined,
            name: stringField(albumRaw, ["name", "title"]) || "未知专辑",
            cover_url: stringField(albumRaw, ["cover_url", "cover"]) || null,
          }
        : null,
      duration_ms: numberField(snapshot, ["duration_ms", "duration"]),
      playable: true,
      extensions: {},
    },
    fallbackPlatform,
  );
};
