# TuneWeave native adapter

This fork treats TuneWeave as a first-class backend instead of exposing it directly to the renderer.

## Current transport layer

- Renderer requests go through `window.api.apis.call("tuneweave", ...)`.
- The Electron main process owns the TuneWeave base URL and caller credentials.
- Caller credentials are repeatable `X-TuneWeave-Credential` headers and remain in memory.
- Arbitrary relative TuneWeave paths are supported, so the transport is not limited to a hand-written endpoint allowlist.
- TuneWeave JSON envelopes and HTTP errors are preserved for the renderer.
- Media streams are registered with a localhost proxy that forwards required TuneWeave media headers and byte ranges.

## Runtime operations

| Operation | Purpose |
| --- | --- |
| `request` | Call any relative TuneWeave HTTP endpoint. |
| `configure` | Set the API base URL and in-memory caller credentials. |
| `status` | Read the current connection status without exposing credential values. |
| `health` | Check `/healthz` without credentials. |
| `media:register` | Convert a `MediaStream` into a localhost URL suitable for the native audio engine. |

The default API base is `http://127.0.0.1:7832`. It can also be overridden at process start with `TUNEWEAVE_API_BASE`.

## Planned integration layers

1. Map TuneWeave `Track`, `Album`, `Artist`, `Playlist`, lyrics and pagination models into SPlayer models.
2. Route search, playback, lyrics and downloads through TuneWeave.
3. Add TuneWeave QR/password/challenge login and account management UI.
4. Add recommendations, Uni Playlist, podcasts, video and platform extension pages.
5. Generate endpoint coverage checks from TuneWeave `routes.json`.
