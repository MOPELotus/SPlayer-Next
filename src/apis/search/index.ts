/**
 * 在线平台搜索分发
 * 对外暴露 searchSongs / searchAlbums / searchArtists / searchPlaylists
 */

import type { Track } from "@shared/types/player";
import type { CoverItem } from "@/types/artist";
import type { Platform } from "@shared/types/platform";
import * as netease from "./netease";
import * as qqmusic from "./qqmusic";
import * as kugou from "./kugou";
import * as tuneweave from "./tuneweave";
import { getTuneWeavePreferences } from "@/services/tuneweave";

/** 搜索结果通用 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

const unsupported = (platform: Platform, category: string): never => {
  throw new Error(`Search not yet supported: ${platform}.${category}`);
};

const builtInSongs = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  if (platform === "netease") return netease.songs(keyword, offset, limit);
  if (platform === "qqmusic") return qqmusic.songs(keyword, offset, limit);
  if (platform === "kugou") return kugou.songs(keyword, offset, limit);
  return unsupported(platform, "songs");
};

const builtInAlbums = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "netease") return netease.albums(keyword, offset, limit);
  if (platform === "qqmusic") return qqmusic.albums(keyword, offset, limit);
  if (platform === "kugou") return kugou.albums(keyword, offset, limit);
  return unsupported(platform, "albums");
};

const builtInArtists = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "netease") return netease.artists(keyword, offset, limit);
  if (platform === "qqmusic") return qqmusic.artists(keyword, offset, limit);
  if (platform === "kugou") return kugou.artists(keyword, offset, limit);
  return unsupported(platform, "artists");
};

const builtInPlaylists = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "netease") return netease.playlists(keyword, offset, limit);
  if (platform === "qqmusic") return qqmusic.playlists(keyword, offset, limit);
  if (platform === "kugou") return kugou.playlists(keyword, offset, limit);
  return unsupported(platform, "playlists");
};

const useTuneWeave = async <T>(
  request: () => Promise<SearchResult<T>>,
  fallback: () => Promise<SearchResult<T>>,
): Promise<SearchResult<T>> => {
  const preferences = getTuneWeavePreferences();
  if (!preferences.enabled) return fallback();
  try {
    return await request();
  } catch (error) {
    if (!preferences.fallbackToBuiltIn) throw error;
    console.warn("[tuneweave] search failed, falling back to built-in provider", error);
    return fallback();
  }
};

/** 搜索单曲 */
export const searchSongs = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> =>
  useTuneWeave(
    () => tuneweave.songs(platform, keyword, offset, limit),
    () => builtInSongs(platform, keyword, offset, limit),
  );

/** 搜索专辑 */
export const searchAlbums = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> =>
  useTuneWeave(
    () => tuneweave.albums(platform, keyword, offset, limit),
    () => builtInAlbums(platform, keyword, offset, limit),
  );

/** 搜索歌手 */
export const searchArtists = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> =>
  useTuneWeave(
    () => tuneweave.artists(platform, keyword, offset, limit),
    () => builtInArtists(platform, keyword, offset, limit),
  );

/** 搜索歌单 */
export const searchPlaylists = (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> =>
  useTuneWeave(
    () => tuneweave.playlists(platform, keyword, offset, limit),
    () => builtInPlaylists(platform, keyword, offset, limit),
  );
