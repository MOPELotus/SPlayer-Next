import { describe, expect, it } from "vitest";
import { tuneWeaveUniItemToTrack, type TuneWeaveUniItem } from "./tuneweave";

describe("TuneWeave Uni Playlist mapping", () => {
  it("maps a Uni track snapshot while preserving the canonical ref", () => {
    const item: TuneWeaveUniItem = {
      item_id: "item-1",
      kind: "track",
      ref: "qq:004Nn9kj2qndCo",
      snapshot: {
        name: "DAMIDAMI",
        duration_ms: 191000,
        artists: [
          { ref: "qq:002glZlN1bdnFr", name: "Sihan" },
          { ref: "qq:001ID6zs3NNni7", name: "三Z-STUDIO" },
        ],
        album: {
          ref: "qq:0002rFfz0Ro6gi",
          name: "绝区零-DAMIDAMI",
          cover_url: "https://y.gtimg.cn/example.jpg",
        },
      },
    };

    const track = tuneWeaveUniItemToTrack(item);
    expect(track).not.toBeNull();
    expect(track).toMatchObject({
      id: "004Nn9kj2qndCo",
      extId: "qq:004Nn9kj2qndCo",
      source: "qqmusic",
      title: "DAMIDAMI",
      duration: 191000,
      cover: "https://y.gtimg.cn/example.jpg",
    });
    expect(track?.artists.map((artist) => artist.name)).toEqual(["Sihan", "三Z-STUDIO"]);
  });

  it("does not expose non-track Uni items to the audio queue", () => {
    expect(
      tuneWeaveUniItemToTrack({
        item_id: "video-1",
        kind: "video",
        ref: "bilibili:bvid:BV1xx411c7mD",
      }),
    ).toBeNull();
  });
});
