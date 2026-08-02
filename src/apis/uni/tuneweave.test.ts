import assert from "node:assert/strict";
import test from "node:test";
import { tuneWeaveUniItemToTrack, type TuneWeaveUniItem } from "./tuneweave";

test("maps a Uni track snapshot while preserving the canonical ref", () => {
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
  assert.ok(track);
  assert.equal(track.id, "004Nn9kj2qndCo");
  assert.equal(track.extId, "qq:004Nn9kj2qndCo");
  assert.equal(track.source, "qqmusic");
  assert.equal(track.title, "DAMIDAMI");
  assert.equal(track.duration, 191000);
  assert.equal(track.cover, "https://y.gtimg.cn/example.jpg");
  assert.deepEqual(
    track.artists.map((artist) => artist.name),
    ["Sihan", "三Z-STUDIO"],
  );
});

test("does not expose non-track Uni items to the audio queue", () => {
  assert.equal(
    tuneWeaveUniItemToTrack({
      item_id: "video-1",
      kind: "video",
      ref: "bilibili:bvid:BV1xx411c7mD",
    }),
    null,
  );
});
