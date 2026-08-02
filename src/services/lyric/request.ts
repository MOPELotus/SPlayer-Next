import type { Track } from "@shared/types/player";
import type { LyricMatchResult } from "@shared/types/lyrics";
import type { Platform } from "@shared/types/platform";
import { useStreamingStore } from "@/stores/streaming";
import { requestTuneWeaveLyrics } from "@/apis/lyrics/tuneweave";
import { getTuneWeavePreferences } from "@/services/tuneweave";

/**
 * 向指定平台请求歌词
 * @param platform - 目标平台
 * @param track - 歌曲信息
 * @returns 在线歌词，不存在则返回 null
 */
export const requestPlatformLyric = async (
  platform: Platform,
  track: Track,
): Promise<LyricMatchResult | null> => {
  const tuneWeavePreferences = getTuneWeavePreferences();
  if (tuneWeavePreferences.enabled) {
    try {
      const result = await requestTuneWeaveLyrics(platform, track);
      if (result) return result;
    } catch (error) {
      if (!tuneWeavePreferences.fallbackToBuiltIn) throw error;
      console.warn("[tuneweave] lyric request failed, falling back", error);
    }
  }

  const byId = track.source === platform;
  // QM lyric 接口要数字 songID；TuneWeave canonical ref 不能作为数字 ID 传入。
  const qqExtId = track.extId && !track.extId.includes(":") ? track.extId : undefined;
  const lookupId = platform === "qqmusic" ? (qqExtId ?? track.id) : track.id;
  const resp = byId
    ? await window.api.lyrics.matchById(platform, lookupId)
    : await window.api.lyrics.matchByQuery(platform, track);
  return resp.ok && resp.data ? resp.data : null;
};

/**
 * 从流媒体服务器请求歌词
 * @param track - 歌曲信息
 * @returns 服务端歌词，不存在则返回 null
 */
export const requestStreamingLyric = (track: Track): Promise<string | null> =>
  useStreamingStore().getLyrics(track);

/**
 * 请求指定平台的 TTML 覆盖歌词
 * @param track - 歌曲信息
 * @param platform - 目标平台
 * @returns IPC 请求结果
 */
export const requestTTMLOverlay = (track: Track, platform: "netease" | "qqmusic") =>
  window.api.lyrics.fetchTTMLOverlay(track, platform);
