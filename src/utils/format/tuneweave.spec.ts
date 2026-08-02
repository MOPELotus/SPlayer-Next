import { describe, expect, it } from "vitest";
import {
  canonicalTuneWeaveTrackRef,
  extractTuneWeaveResources,
  tuneWeaveTrackToTrack,
} from "./tuneweave";
import type { TuneWeaveTrack } from "@shared/types/tuneweave";

describe("TuneWeave resource formatting", () => {
  it("unwraps discriminated TuneWeave search resources", () => {
    const payload = {
      items: [
        {
          type: "track",
          data: {
            ref: "qq:004Nn9kj2qndCo",
            platform: "qq",
            id: "004Nn9kj2qndCo",
            name: "DAMIDAMI",
            aliases: ["《绝区零》卢西娅EP"],
            artists: [
              { ref: "qq:002glZlN1bdnFr", name: "Sihan" },
              { ref: "qq:001ID6zs3NNni7", name: "三Z-STUDIO" },
              { ref: "qq:001uz8tl04tdL8", name: "HOYO-MiX" },
            ],
            album: {
              ref: "qq:0002rFfz0Ro6gi",
              name: "绝区零-DAMIDAMI",
              cover_url: "https://y.gtimg.cn/example.jpg",
            },
            duration_ms: 191000,
            playable: null,
            available_qualities: ["low", "standard", "higher", "high", "lossless"],
          },
        },
      ],
    };

    const tracks = extractTuneWeaveResources<TuneWeaveTrack>(payload, "track");
    expect(tracks).toHaveLength(1);
    const mapped = tuneWeaveTrackToTrack(tracks[0], "qqmusic");
    expect(mapped.title).toBe("DAMIDAMI");
    expect(mapped.source).toBe("qqmusic");
    expect(mapped.extId).toBe("qq:004Nn9kj2qndCo");
    expect(mapped.artists.map((artist) => artist.name)).toEqual([
      "Sihan",
      "三Z-STUDIO",
      "HOYO-MiX",
    ]);
    expect(mapped.album?.name).toBe("绝区零-DAMIDAMI");
    expect(mapped.cover).toBe("https://y.gtimg.cn/example.jpg");
    expect(mapped.duration).toBe(191000);
    expect(canonicalTuneWeaveTrackRef(mapped)).toBe("qq:004Nn9kj2qndCo");
  });

  it("filters resources by discriminant", () => {
    const resources = [
      { type: "artist", data: { ref: "qq:a", platform: "qq", id: "a", name: "Artist" } },
      { type: "track", data: { ref: "qq:t", platform: "qq", id: "t", name: "Track" } },
    ];
    const tracks = extractTuneWeaveResources<TuneWeaveTrack>(resources, "track");
    expect(tracks.map((track) => track.name)).toEqual(["Track"]);
  });
});
