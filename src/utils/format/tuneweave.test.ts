import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTuneWeaveTrackRef,
  extractTuneWeaveResources,
  tuneWeaveTrackToTrack,
} from "./tuneweave";
import type { TuneWeaveTrack } from "@shared/types/tuneweave";

test("unwraps discriminated TuneWeave search resources", () => {
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
  assert.equal(tracks.length, 1);
  const mapped = tuneWeaveTrackToTrack(tracks[0], "qqmusic");
  assert.equal(mapped.title, "DAMIDAMI");
  assert.equal(mapped.source, "qqmusic");
  assert.equal(mapped.extId, "qq:004Nn9kj2qndCo");
  assert.deepEqual(
    mapped.artists.map((artist) => artist.name),
    ["Sihan", "三Z-STUDIO", "HOYO-MiX"],
  );
  assert.equal(mapped.album?.name, "绝区零-DAMIDAMI");
  assert.equal(mapped.cover, "https://y.gtimg.cn/example.jpg");
  assert.equal(mapped.duration, 191000);
  assert.equal(canonicalTuneWeaveTrackRef(mapped), "qq:004Nn9kj2qndCo");
});

test("filters resources by discriminant", () => {
  const resources = [
    { type: "artist", data: { ref: "qq:a", platform: "qq", id: "a", name: "Artist" } },
    { type: "track", data: { ref: "qq:t", platform: "qq", id: "t", name: "Track" } },
  ];
  const tracks = extractTuneWeaveResources<TuneWeaveTrack>(resources, "track");
  assert.deepEqual(
    tracks.map((track) => track.name),
    ["Track"],
  );
});
