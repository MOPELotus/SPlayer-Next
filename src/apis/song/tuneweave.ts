import type { Track } from "@shared/types/player";
import type { TuneWeaveMediaStream } from "@shared/types/tuneweave";
import type { QualityLevel } from "@/utils/quality";
import { registerTuneWeaveMedia, tuneweaveData } from "@/apis/tuneweave";
import { ensureTuneWeaveConfigured, tuneWeaveAccountQuery } from "@/services/tuneweave";
import { canonicalTuneWeaveTrackRef } from "@/utils/format/tuneweave";

const QUALITY_MAP: Record<QualityLevel, string> = {
  "hi-res": "hires",
  lossless: "lossless",
  hq: "high",
  sq: "higher",
  lq: "standard",
};

export interface TuneWeaveResolvedAudio {
  url: string;
  isTrial: boolean;
  expiresAt: number;
  stream: TuneWeaveMediaStream;
}

export const resolveTuneWeaveUrl = async (
  track: Track,
  quality: QualityLevel,
): Promise<TuneWeaveResolvedAudio> => {
  const preferences = await ensureTuneWeaveConfigured();
  const ref = canonicalTuneWeaveTrackRef(track);
  const query: Record<string, string | boolean | undefined> = {
    quality: QUALITY_MAP[quality],
    fallback: preferences.playbackFallback,
    playback_platform: preferences.playbackPlatform || undefined,
    fallback_platforms:
      preferences.fallbackPlatforms.length > 0
        ? preferences.fallbackPlatforms.join(",")
        : undefined,
    ...tuneWeaveAccountQuery(preferences),
  };
  const stream = await tuneweaveData<TuneWeaveMediaStream>({
    path: `/v1/tracks/${encodeURIComponent(ref)}/stream`,
    query,
  });
  const local = await registerTuneWeaveMedia(stream);
  return {
    url: local.url,
    expiresAt: local.expiresAt,
    isTrial: stream.trial !== null && stream.trial !== undefined && stream.trial !== false,
    stream,
  };
};
