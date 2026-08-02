import type { CoverItem } from "@/types/artist";
import type { Platform } from "@shared/types/platform";
import type { Track, TrackSource } from "@shared/types/player";
import type {
  TuneWeaveAlbum,
  TuneWeaveArtist,
  TuneWeavePlaylist,
  TuneWeaveResource,
  TuneWeaveTrack,
} from "@shared/types/tuneweave";

const PLATFORM_TO_TUNEWEAVE: Record<Platform, string> = {
  netease: "netease",
  qqmusic: "qq",
  kugou: "kugou",
};

const TUNEWEAVE_TO_PLATFORM: Record<string, Platform> = {
  netease: "netease",
  qq: "qqmusic",
  qqmusic: "qqmusic",
  kugou: "kugou",
};

const isPlatform = (source: TrackSource): source is Platform =>
  source === "netease" || source === "qqmusic" || source === "kugou";

export const toTuneWeavePlatform = (platform: Platform): string =>
  PLATFORM_TO_TUNEWEAVE[platform];

export const fromTuneWeavePlatform = (
  platform: string | null | undefined,
  fallback: Platform,
): Platform => TUNEWEAVE_TO_PLATFORM[platform ?? ""] ?? fallback;

export const tuneWeaveRefId = (ref: string | null | undefined): string | undefined => {
  if (!ref) return undefined;
  const index = ref.indexOf(":");
  return index === -1 ? ref : ref.slice(index + 1);
};

export const canonicalTuneWeaveTrackRef = (track: Track): string => {
  if (track.extId?.includes(":")) return track.extId;
  if (!isPlatform(track.source)) {
    throw new Error(`Track source cannot be represented by TuneWeave: ${track.source}`);
  }
  return `${toTuneWeavePlatform(track.source)}:${track.id}`;
};

const resourceType = (value: unknown): string | undefined =>
  value && typeof value === "object" && "type" in value
    ? String((value as { type?: unknown }).type ?? "")
    : undefined;

export const unwrapTuneWeaveResource = <T>(
  value: T | TuneWeaveResource<T>,
  expectedType?: string,
): T | null => {
  if (!value || typeof value !== "object") return value as T;
  if (!("data" in value) || !("type" in value)) return value as T;
  const wrapped = value as TuneWeaveResource<T>;
  if (expectedType && wrapped.type !== expectedType) return null;
  return wrapped.data;
};

/**
 * TuneWeave 列表端点在不同资源中可能直接返回数组，也可能放在 items/results/resources 中。
 * 每一项还可能是 `{ type, data }` 判别包装。
 */
export const extractTuneWeaveResources = <T>(payload: unknown, expectedType: string): T[] => {
  const arrays: unknown[][] = [];
  if (Array.isArray(payload)) arrays.push(payload);
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    for (const key of [
      "items",
      "results",
      "resources",
      "tracks",
      "albums",
      "artists",
      "playlists",
    ]) {
      if (Array.isArray(record[key])) arrays.push(record[key] as unknown[]);
    }
    if (arrays.length === 0 && resourceType(payload) === expectedType) arrays.push([payload]);
  }

  const result: T[] = [];
  for (const array of arrays) {
    for (const item of array) {
      const unwrapped = unwrapTuneWeaveResource(
        item as T | TuneWeaveResource<T>,
        expectedType,
      );
      if (unwrapped && typeof unwrapped === "object") result.push(unwrapped);
    }
  }
  return result;
};

export const tuneWeaveTrackToTrack = (
  track: TuneWeaveTrack,
  fallbackPlatform: Platform,
): Track => {
  const platform = fromTuneWeavePlatform(track.platform, fallbackPlatform);
  const cover = track.album?.cover_url ?? undefined;
  return {
    id: String(track.id ?? tuneWeaveRefId(track.ref) ?? track.ref),
    extId: track.ref,
    source: platform,
    title: track.name || "未知歌曲",
    comment: track.aliases?.filter(Boolean).join(" / ") || undefined,
    artists: (track.artists ?? []).map((artist) => ({
      id: artist.id ?? tuneWeaveRefId(artist.ref),
      name: artist.name || "未知歌手",
      avatar: artist.avatar_url ?? undefined,
    })),
    album: track.album
      ? {
          id: track.album.id ?? tuneWeaveRefId(track.album.ref),
          name: track.album.name || "未知专辑",
          cover,
          artist:
            track.album.artist ??
            track.album.artists?.map((artist) => artist.name).filter(Boolean).join(" / "),
          trackCount: track.album.track_count ?? undefined,
          year: track.album.release_date
            ? Number.parseInt(track.album.release_date.slice(0, 4), 10) || undefined
            : undefined,
        }
      : undefined,
    duration: Math.max(0, Number(track.duration_ms ?? 0)),
    cover,
    coverOriginal: cover,
    fee: track.playable === false ? 1 : 0,
  };
};

export const tuneWeaveAlbumToCover = (album: TuneWeaveAlbum): CoverItem => ({
  id: album.id || tuneWeaveRefId(album.ref) || album.ref,
  title: album.name || "未知专辑",
  cover: album.cover_url ?? undefined,
  subtitle:
    album.artist ??
    album.artists?.map((artist) => artist.name).filter(Boolean).join(" / ") ??
    "",
  trackCount: Math.max(0, Number(album.track_count ?? 0)),
});

export const tuneWeaveArtistToCover = (artist: TuneWeaveArtist): CoverItem => ({
  id: artist.id || tuneWeaveRefId(artist.ref) || artist.ref,
  title: artist.name || "未知歌手",
  cover: artist.avatar_url ?? undefined,
  subtitle: "",
  trackCount: Math.max(0, Number(artist.track_count ?? 0)),
});

export const tuneWeavePlaylistToCover = (playlist: TuneWeavePlaylist): CoverItem => ({
  id: playlist.id || tuneWeaveRefId(playlist.ref) || playlist.ref,
  title: playlist.name || "未命名歌单",
  cover: playlist.cover_url ?? undefined,
  subtitle:
    typeof playlist.owner === "string" ? playlist.owner : (playlist.owner?.name ?? ""),
  trackCount: Math.max(0, Number(playlist.track_count ?? 0)),
});
