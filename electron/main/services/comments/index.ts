import { pickBestCandidate, type LyricCandidate } from "@main/apis/common/lyric/utils";
import { callNetease } from "@main/apis/netease";
import { requestTuneWeave } from "@main/apis/tuneweave";
import { pluginRegistry, type PluginRuntime } from "@main/plugins/registry";
import { callMusicComment, callMusicSearch } from "@main/plugins/router";
import { pluginLog } from "@main/utils/logger";
import type { CommentSource, MusicCommentPage, MusicCommentQuery } from "@shared/types/comment";
import type { MusicSearchCandidate } from "@shared/types/plugin";
import type { Track } from "@shared/types/player";
import {
  buildCommentSources,
  normalizeNeteaseCommentPage,
  normalizeTuneWeaveCommentPage,
} from "./data";

const TUNEWEAVE_SOURCE_ID = "builtin:tuneweave";
const NETEASE_SOURCE_ID = "builtin:netease";
const NETEASE_RESOURCE_TYPE = "R_SO_4_";

const PLATFORM_TO_PLUGIN_SOURCE: Record<string, string> = {
  netease: "wy",
  qqmusic: "tx",
  kugou: "kg",
};

const PLATFORM_TO_TUNEWEAVE: Record<string, string> = {
  netease: "netease",
  qqmusic: "qq",
  kugou: "kugou",
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface ParsedPluginSource {
  pluginId: string;
  source: string;
}

interface TuneWeaveEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

const parsePluginSource = (sourceId: string): ParsedPluginSource | null => {
  if (!sourceId.startsWith("plugin:")) return null;
  const rest = sourceId.slice("plugin:".length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  return {
    pluginId: rest.slice(0, sep),
    source: rest.slice(sep + 1),
  };
};

const toKeyword = (track: Track): string =>
  `${track.title} ${track.artists.map((artist) => artist.name).join(" ")}`.trim();

const toPluginCandidate = (track: Track): MusicSearchCandidate => ({
  id: track.id,
  name: track.title,
  singer: track.artists.map((artist) => artist.name).join("/"),
  album: track.album?.name,
  durationMs: track.duration,
});

const tuneWeaveTrackRef = (track: Track): string | null => {
  const extId = track.extId?.trim();
  if (extId?.includes(":")) return extId;
  const platform = PLATFORM_TO_TUNEWEAVE[track.source];
  return platform && track.id ? `${platform}:${track.id}` : null;
};

const unwrapTuneWeaveData = <T>(value: unknown): T => {
  if (!value || typeof value !== "object") throw new Error("invalid TuneWeave response");
  const envelope = value as TuneWeaveEnvelope<T>;
  if (!envelope.ok) throw new Error(envelope.error?.message || "TuneWeave comment request failed");
  return envelope.data as T;
};

const findPluginMatch = async (
  rt: PluginRuntime,
  source: string,
  track: Track,
): Promise<MusicSearchCandidate | null> => {
  if (PLATFORM_TO_PLUGIN_SOURCE[track.source] === source && track.id)
    return toPluginCandidate(track);
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const res = await callMusicSearch(rt, { source, keyword, limit: 20 });
  const list = res?.list ?? [];
  const candidates: LyricCandidate<MusicSearchCandidate>[] = list.map((item) => ({
    name: item.name,
    artist: item.singer ?? "",
    album: item.album,
    duration: item.durationMs,
    extra: item,
  }));
  return pickBestCandidate(candidates, track)?.extra ?? null;
};

const findNeteaseId = async (track: Track): Promise<string | null> => {
  if (track.source === "netease" && track.id) return track.id;
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const { status, body } = await callNetease("search", {
    keywords: keyword,
    type: 1,
    limit: 20,
  });
  if (status !== 200) return null;
  const songs = body.result?.songs ?? [];
  const candidates: LyricCandidate<{ id: string }>[] = songs.map(
    (song: {
      id: string | number;
      name?: string;
      artists?: { name: string }[];
      album?: { name?: string };
      duration?: number;
    }) => ({
      name: song.name ?? "",
      artist: (song.artists ?? []).map((artist) => artist.name).join(" / "),
      album: song.album?.name,
      duration: song.duration,
      extra: { id: String(song.id) },
    }),
  );
  return pickBestCandidate(candidates, track)?.extra.id ?? null;
};

const getTuneWeaveComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const reference = tuneWeaveTrackRef(args.track);
  if (!reference) return { list: [], total: 0, page: args.page, limit: args.limit };
  const response = await requestTuneWeave({
    path: `/v1/resources/track/${encodeURIComponent(reference)}/comments`,
    query: {
      view: args.type === "hot" ? "hot" : "all",
      sort: args.type === "hot" ? "hot" : "time",
      limit: args.limit,
      offset: (args.page - 1) * args.limit,
    },
  });
  return normalizeTuneWeaveCommentPage(
    unwrapTuneWeaveData(response),
    args.type,
    args.page,
    args.limit,
  );
};

const getNeteaseComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const id = await findNeteaseId(args.track);
  if (!id) return { list: [], total: 0, page: args.page, limit: args.limit };

  const apiName = args.type === "hot" ? "comment_hot" : "comment_music";
  const { body } = await callNetease(apiName, {
    id,
    type: NETEASE_RESOURCE_TYPE,
    limit: args.limit,
    offset: (args.page - 1) * args.limit,
  });
  return normalizeNeteaseCommentPage(body, args.type, args.page, args.limit);
};

const getPluginComments = async (
  parsed: ParsedPluginSource,
  args: MusicCommentQuery,
): Promise<MusicCommentPage> => {
  const rt = pluginRegistry.getRuntime(parsed.pluginId);
  if (!rt || rt.status.state !== "ready") throw new Error("plugin comment source is not ready");
  try {
    const musicInfo = await findPluginMatch(rt, parsed.source, args.track);
    if (!musicInfo) return { list: [], total: 0, page: args.page, limit: args.limit };
    return await callMusicComment(rt, {
      source: parsed.source,
      musicInfo,
      type: args.type,
      page: args.page,
      limit: args.limit,
    });
  } catch (err) {
    pluginLog.warn(
      "matchComment failed",
      parsed.pluginId,
      parsed.source,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
};

const normalizeQuery = (args: MusicCommentQuery): MusicCommentQuery => ({
  ...args,
  page: Math.max(1, Math.floor(Number(args.page) || 1)),
  limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(args.limit) || DEFAULT_LIMIT))),
});

/** 获取当前可用评论源 */
export const getCommentSources = (): CommentSource[] =>
  buildCommentSources(pluginRegistry.listInfo());

/** 获取歌曲评论 */
export const getMusicComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const query = normalizeQuery(args);
  if (query.sourceId === TUNEWEAVE_SOURCE_ID) return getTuneWeaveComments(query);
  if (query.sourceId === NETEASE_SOURCE_ID) return getNeteaseComments(query);
  const parsed = parsePluginSource(query.sourceId);
  if (parsed) return getPluginComments(parsed, query);
  throw new Error(`unknown comment source: ${query.sourceId}`);
};
