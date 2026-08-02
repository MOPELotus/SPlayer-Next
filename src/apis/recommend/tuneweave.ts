import type { CoverItem } from "@/types/artist";
import type { Track } from "@shared/types/player";
import type { Platform } from "@shared/types/platform";
import type { TuneWeavePlaylist, TuneWeaveTrack } from "@shared/types/tuneweave";
import { tuneweaveRequest } from "@/apis/tuneweave";
import {
  ensureTuneWeaveConfigured,
  tuneWeaveSelectedAccountQuery,
} from "@/services/tuneweave";
import {
  extractTuneWeaveResources,
  fromTuneWeavePlatform,
  tuneWeavePlaylistToCover,
  tuneWeaveTrackToTrack,
} from "@/utils/format/tuneweave";

const DEFAULT_PLATFORM: Platform = "netease";

const recommendationRequest = async <T>(
  path: string,
  expectedType: string,
  limit: number,
): Promise<T[]> => {
  const preferences = await ensureTuneWeaveConfigured();
  const envelope = await tuneweaveRequest<unknown>({
    path,
    query: {
      limit,
      ...tuneWeaveSelectedAccountQuery(preferences),
    },
  });
  if (!envelope.ok) throw new Error(envelope.error.message);
  return extractTuneWeaveResources<T>(envelope.data, expectedType);
};

export const fetchTuneWeaveRecommendedTracks = async (limit = 50): Promise<Track[]> => {
  const tracks = await recommendationRequest<TuneWeaveTrack>(
    "/v1/recommendations/tracks",
    "track",
    limit,
  );
  return tracks.map((track) =>
    tuneWeaveTrackToTrack(
      track,
      fromTuneWeavePlatform(track.platform, DEFAULT_PLATFORM),
    ),
  );
};

export const fetchTuneWeavePersonalFm = async (limit = 30): Promise<Track[]> => {
  const tracks = await recommendationRequest<TuneWeaveTrack>(
    "/v1/recommendations/personal-fm",
    "track",
    limit,
  );
  return tracks.map((track) =>
    tuneWeaveTrackToTrack(
      track,
      fromTuneWeavePlatform(track.platform, DEFAULT_PLATFORM),
    ),
  );
};

export const fetchTuneWeaveRecommendedPlaylists = async (
  limit = 20,
): Promise<CoverItem[]> => {
  const playlists = await recommendationRequest<TuneWeavePlaylist>(
    "/v1/recommendations/playlists",
    "playlist",
    limit,
  );
  return playlists.map(tuneWeavePlaylistToCover);
};
