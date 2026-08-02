import type { Track } from "@shared/types/player";
import type { TuneWeaveResource, TuneWeaveTrack } from "@shared/types/tuneweave";
import { tuneweaveData } from "@/apis/tuneweave";
import { ensureTuneWeaveConfigured, tuneWeaveSelectedAccountQuery } from "@/services/tuneweave";
import {
  fromTuneWeavePlatform,
  tuneWeaveTrackToTrack,
  unwrapTuneWeaveResource,
} from "@/utils/format/tuneweave";

export interface TuneWeaveHistoryItem {
  track: Track;
  playCount?: number;
  score?: number;
  lastPlayedAt?: string;
}

export interface TuneWeaveCloudItem {
  cloudRef: string;
  track: Track;
  filename?: string;
  fileSize?: number;
  fileType?: string;
  bitrate?: number;
  addedAt?: string;
  matchedTrackRef?: string;
}

interface RawHistoryItem {
  track?: TuneWeaveTrack | TuneWeaveResource<TuneWeaveTrack>;
  play_count?: number | null;
  score?: number | null;
  last_played_at?: string | null;
}

interface RawCloudItem {
  ref?: string;
  cloud_track_ref?: string;
  track?: TuneWeaveTrack | TuneWeaveResource<TuneWeaveTrack>;
  filename?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  bitrate?: number | null;
  added_at?: string | null;
  matched_track_ref?: string | null;
}

const selectedQuery = async (): Promise<{ platform: string; account?: string }> => {
  const preferences = await ensureTuneWeaveConfigured();
  return tuneWeaveSelectedAccountQuery(preferences);
};

const recordArray = (payload: unknown, keys: readonly string[]): Record<string, unknown>[] => {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return recordArray(record[key], keys);
  }
  if (record.data && typeof record.data === "object") return recordArray(record.data, keys);
  return [];
};

const mapTrack = (
  value: TuneWeaveTrack | TuneWeaveResource<TuneWeaveTrack> | undefined,
): Track | null => {
  if (!value) return null;
  const track = unwrapTuneWeaveResource(value, "track");
  if (!track?.ref) return null;
  return tuneWeaveTrackToTrack(track, fromTuneWeavePlatform(track.platform, "netease"));
};

export const normalizeTuneWeaveHistory = (payload: unknown): TuneWeaveHistoryItem[] =>
  recordArray(payload, ["items", "entries", "history", "results"])
    .map((record): TuneWeaveHistoryItem | null => {
      const raw = record as RawHistoryItem;
      const track = mapTrack(raw.track);
      if (!track) return null;
      return {
        track,
        ...(typeof raw.play_count === "number" ? { playCount: raw.play_count } : {}),
        ...(typeof raw.score === "number" ? { score: raw.score } : {}),
        ...(typeof raw.last_played_at === "string" && raw.last_played_at
          ? { lastPlayedAt: raw.last_played_at }
          : {}),
      };
    })
    .filter((item): item is TuneWeaveHistoryItem => item !== null);

export const normalizeTuneWeaveCloud = (payload: unknown): TuneWeaveCloudItem[] =>
  recordArray(payload, ["items", "tracks", "cloud_tracks", "results"])
    .map((record): TuneWeaveCloudItem | null => {
      const raw = record as RawCloudItem;
      const track = mapTrack(raw.track);
      const cloudRef = raw.ref ?? raw.cloud_track_ref ?? "";
      if (!track || !cloudRef) return null;
      if (typeof raw.file_size === "number") track.fileSize = raw.file_size;
      track.cloud = true;
      return {
        cloudRef,
        track,
        ...(typeof raw.filename === "string" && raw.filename ? { filename: raw.filename } : {}),
        ...(typeof raw.file_size === "number" ? { fileSize: raw.file_size } : {}),
        ...(typeof raw.file_type === "string" && raw.file_type ? { fileType: raw.file_type } : {}),
        ...(typeof raw.bitrate === "number" ? { bitrate: raw.bitrate } : {}),
        ...(typeof raw.added_at === "string" && raw.added_at ? { addedAt: raw.added_at } : {}),
        ...(typeof raw.matched_track_ref === "string" && raw.matched_track_ref
          ? { matchedTrackRef: raw.matched_track_ref }
          : {}),
      };
    })
    .filter((item): item is TuneWeaveCloudItem => item !== null);

export const fetchTuneWeavePlaybackHistory = async (
  period: "all_time" | "week" = "all_time",
  limit = 200,
  offset = 0,
): Promise<TuneWeaveHistoryItem[]> => {
  const query = await selectedQuery();
  const data = await tuneweaveData<unknown>({
    path: "/v1/account/history",
    query: { ...query, period, limit, offset },
  });
  return normalizeTuneWeaveHistory(data);
};

export const fetchTuneWeaveCloudTracks = async (
  limit = 500,
  offset = 0,
): Promise<TuneWeaveCloudItem[]> => {
  const query = await selectedQuery();
  const data = await tuneweaveData<unknown>({
    path: "/v1/account/cloud/tracks",
    query: { ...query, limit, offset },
  });
  return normalizeTuneWeaveCloud(data);
};
