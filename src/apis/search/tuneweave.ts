import type { CoverItem } from "@/types/artist";
import type { Track } from "@shared/types/player";
import type { Platform } from "@shared/types/platform";
import type {
  TuneWeaveAlbum,
  TuneWeaveArtist,
  TuneWeavePlaylist,
  TuneWeaveTrack,
} from "@shared/types/tuneweave";
import { tuneweaveRequest } from "@/apis/tuneweave";
import { ensureTuneWeaveConfigured } from "@/services/tuneweave";
import {
  extractTuneWeaveResources,
  toTuneWeavePlatform,
  tuneWeaveAlbumToCover,
  tuneWeaveArtistToCover,
  tuneWeavePlaylistToCover,
  tuneWeaveTrackToTrack,
} from "@/utils/format/tuneweave";
import type { SearchResult } from "./index";

const search = async <T>(
  platform: Platform,
  type: "track" | "album" | "artist" | "playlist",
  keyword: string,
  offset: number,
  limit: number,
): Promise<{ items: T[]; total: number; hasMore: boolean }> => {
  await ensureTuneWeaveConfigured();
  const envelope = await tuneweaveRequest<unknown>({
    path: "/v1/search",
    query: {
      q: keyword,
      type,
      platform: toTuneWeavePlatform(platform),
      offset,
      limit,
    },
  });
  if (!envelope.ok) throw new Error(envelope.error.message);
  const items = extractTuneWeaveResources<T>(envelope.data, type);
  const pagination = envelope.meta?.pagination;
  const total = pagination?.total ?? offset + items.length;
  const hasMore = pagination?.has_more ?? offset + items.length < total;
  return { items, total, hasMore };
};

export const songs = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  const result = await search<TuneWeaveTrack>(platform, "track", keyword, offset, limit);
  return {
    ...result,
    items: result.items.map((track) => tuneWeaveTrackToTrack(track, platform)),
  };
};

export const albums = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  const result = await search<TuneWeaveAlbum>(platform, "album", keyword, offset, limit);
  return { ...result, items: result.items.map(tuneWeaveAlbumToCover) };
};

export const artists = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  const result = await search<TuneWeaveArtist>(platform, "artist", keyword, offset, limit);
  return { ...result, items: result.items.map(tuneWeaveArtistToCover) };
};

export const playlists = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  const result = await search<TuneWeavePlaylist>(platform, "playlist", keyword, offset, limit);
  return { ...result, items: result.items.map(tuneWeavePlaylistToCover) };
};
