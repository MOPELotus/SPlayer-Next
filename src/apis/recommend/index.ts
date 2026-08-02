import type { Track } from "@shared/types/player";
import type { CoverItem } from "@/types/artist";
import {
  fetchDailySongs as fetchNeteaseDailySongs,
  fetchPersonalFm as fetchNeteasePersonalFm,
  fetchRecommendPlaylists as fetchNeteaseRecommendPlaylists,
} from "./netease";
import {
  fetchTuneWeavePersonalFm,
  fetchTuneWeaveRecommendedPlaylists,
  fetchTuneWeaveRecommendedTracks,
} from "./tuneweave";
import { getTuneWeavePreferences } from "@/services/tuneweave";

const preferTuneWeave = async <T>(
  tuneWeaveTask: () => Promise<T>,
  fallbackTask: () => Promise<T>,
): Promise<T> => {
  const preferences = getTuneWeavePreferences();
  if (!preferences.enabled) return fallbackTask();
  try {
    return await tuneWeaveTask();
  } catch (error) {
    if (!preferences.fallbackToBuiltIn) throw error;
    console.warn("[tuneweave] recommendation request failed, falling back", error);
    return fallbackTask();
  }
};

export const fetchDailySongs = (): Promise<Track[]> =>
  preferTuneWeave(() => fetchTuneWeaveRecommendedTracks(50), fetchNeteaseDailySongs);

export const fetchPersonalFm = (): Promise<Track[]> =>
  preferTuneWeave(() => fetchTuneWeavePersonalFm(30), fetchNeteasePersonalFm);

export const fetchRecommendPlaylists = (loggedIn: boolean): Promise<CoverItem[]> =>
  preferTuneWeave(
    () => fetchTuneWeaveRecommendedPlaylists(20),
    () => fetchNeteaseRecommendPlaylists(loggedIn),
  );

export {
  fetchArtists,
  fetchHeartModeList,
  fetchNewAlbums,
  fetchRadarPlaylists,
  submitFmTrash,
} from "./netease";
