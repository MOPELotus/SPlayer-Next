import type { Track } from "@shared/types/player";
import type { LyricFormat, LyricMatchResult } from "@shared/types/lyrics";
import type { Platform } from "@shared/types/platform";
import type { TuneWeaveLyrics } from "@shared/types/tuneweave";
import { tuneweaveData } from "@/apis/tuneweave";
import { ensureTuneWeaveConfigured, tuneWeaveAccountQuery } from "@/services/tuneweave";
import { canonicalTuneWeaveTrackRef } from "@/utils/format/tuneweave";
import { detectFormat } from "@/utils/lyric/parse";

const SUPPORTED_FORMATS = new Set<LyricFormat>([
  "ttml",
  "lys",
  "yrc",
  "qrc",
  "krc",
  "lrc",
  "srt",
  "ass",
]);

const resolveFormat = (declared: string | null | undefined, content: string): LyricFormat => {
  if (declared && SUPPORTED_FORMATS.has(declared as LyricFormat)) return declared as LyricFormat;
  return detectFormat(content);
};

export const requestTuneWeaveLyrics = async (
  platform: Platform,
  track: Track,
): Promise<LyricMatchResult | null> => {
  const preferences = await ensureTuneWeaveConfigured();
  const ref = canonicalTuneWeaveTrackRef(track);
  const data = await tuneweaveData<TuneWeaveLyrics>({
    path: `/v1/tracks/${encodeURIComponent(ref)}/lyrics`,
    query: {
      word_synced: true,
      ...tuneWeaveAccountQuery(preferences),
    },
  });
  const content = data.word_synced?.trim() || data.plain?.trim();
  if (!content) return null;
  return {
    platform,
    format: resolveFormat(data.format, content),
    content,
    translation: data.translated?.trim() || undefined,
    translationFormat: data.translated ? detectFormat(data.translated) : undefined,
    romaji: data.romanized?.trim() || undefined,
    romajiFormat: data.romanized ? detectFormat(data.romanized) : undefined,
  };
};
