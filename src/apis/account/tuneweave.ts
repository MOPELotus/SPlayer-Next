import type { CoverItem } from "@/types/artist";
import type { Track } from "@shared/types/player";
import type { TuneWeavePlaylist, TuneWeaveTrack } from "@shared/types/tuneweave";
import {
  clearTuneWeaveCredentials,
  tuneweaveData,
} from "@/apis/tuneweave";
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

export type TuneWeaveAccountProfile = Record<string, unknown>;
export type TuneWeaveMembership = Record<string, unknown>;
export type TuneWeaveSession = Record<string, unknown>;

const selectedQuery = async (): Promise<{ platform: string; account?: string }> => {
  const preferences = await ensureTuneWeaveConfigured();
  return tuneWeaveSelectedAccountQuery(preferences);
};

export const fetchTuneWeaveAccountProfile = async (): Promise<TuneWeaveAccountProfile> =>
  tuneweaveData<TuneWeaveAccountProfile>({
    path: "/v1/account/profile",
    query: await selectedQuery(),
  });

export const fetchTuneWeaveMembership = async (): Promise<TuneWeaveMembership> =>
  tuneweaveData<TuneWeaveMembership>({
    path: "/v1/account/membership",
    query: await selectedQuery(),
  });

export const fetchTuneWeaveSession = async (): Promise<TuneWeaveSession> =>
  tuneweaveData<TuneWeaveSession>({
    path: "/v1/auth/session",
    query: await selectedQuery(),
  });

export const refreshTuneWeaveSession = async (): Promise<TuneWeaveSession> =>
  tuneweaveData<TuneWeaveSession>({
    method: "POST",
    path: "/v1/auth/session/refresh",
    query: await selectedQuery(),
  });

export const logoutTuneWeaveSession = async (): Promise<void> => {
  const query = await selectedQuery();
  await tuneweaveData<unknown>({
    method: "DELETE",
    path: "/v1/auth/session",
    query,
  });
  await clearTuneWeaveCredentials();
};

export const fetchTuneWeaveAccountPlaylists = async (limit = 100): Promise<CoverItem[]> => {
  const query = await selectedQuery();
  const data = await tuneweaveData<unknown>({
    path: "/v1/account/playlists",
    query: { ...query, limit },
  });
  return extractTuneWeaveResources<TuneWeavePlaylist>(data, "playlist").map(
    tuneWeavePlaylistToCover,
  );
};

export const fetchTuneWeaveFavoriteTracks = async (limit = 500): Promise<Track[]> => {
  const query = await selectedQuery();
  const data = await tuneweaveData<unknown>({
    path: "/v1/account/favorites/tracks",
    query: { ...query, limit },
  });
  return extractTuneWeaveResources<TuneWeaveTrack>(data, "track").map((track) =>
    tuneWeaveTrackToTrack(
      track,
      fromTuneWeavePlatform(track.platform, "netease"),
    ),
  );
};

export const setTuneWeaveFavoriteTrack = async (
  trackRef: string,
  favorite: boolean,
): Promise<void> => {
  const query = await selectedQuery();
  await tuneweaveData<unknown>({
    method: favorite ? "PUT" : "DELETE",
    path: `/v1/account/favorites/tracks/${encodeURIComponent(trackRef)}`,
    query,
  });
};
