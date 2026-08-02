import { describe, expect, it } from "vitest";
import { normalizeTuneWeaveCloud, normalizeTuneWeaveHistory } from "./tuneweaveLibrary";

const track = {
  ref: "qq:004Nn9kj2qndCo",
  platform: "qq",
  id: "004Nn9kj2qndCo",
  name: "DAMIDAMI",
  artists: [{ ref: "qq:artist:1", name: "Sihan" }],
  album: {
    ref: "qq:album:1",
    name: "绝区零-DAMIDAMI",
    cover_url: "https://example.com/cover.jpg",
  },
  duration_ms: 191000,
};

describe("TuneWeave account library mapping", () => {
  it("maps playback history entries", () => {
    const items = normalizeTuneWeaveHistory({
      items: [
        {
          track,
          play_count: 7,
          score: 95,
          last_played_at: "2026-08-02T10:00:00Z",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      playCount: 7,
      score: 95,
      lastPlayedAt: "2026-08-02T10:00:00Z",
      track: {
        id: "004Nn9kj2qndCo",
        extId: "qq:004Nn9kj2qndCo",
        source: "qqmusic",
        title: "DAMIDAMI",
      },
    });
  });

  it("maps cloud metadata onto playable tracks", () => {
    const items = normalizeTuneWeaveCloud({
      tracks: [
        {
          ref: "qq:cloud:123",
          track: { type: "track", data: track },
          filename: "DAMIDAMI.flac",
          file_size: 32100000,
          file_type: "flac",
          bitrate: 999000,
          added_at: "2026-08-01T10:00:00Z",
          matched_track_ref: "qq:004Nn9kj2qndCo",
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cloudRef: "qq:cloud:123",
      filename: "DAMIDAMI.flac",
      fileSize: 32100000,
      fileType: "flac",
      bitrate: 999000,
      matchedTrackRef: "qq:004Nn9kj2qndCo",
      track: {
        cloud: true,
        fileSize: 32100000,
        extId: "qq:004Nn9kj2qndCo",
      },
    });
  });
});
