# TuneWeave native adapter

This fork treats TuneWeave as a first-class backend instead of exposing platform APIs directly to the renderer.

## Architecture

- Renderer requests go through `window.api.apis.call("tuneweave", ...)`.
- The Electron main process owns the TuneWeave base URL and caller credentials.
- Caller credentials are repeatable `X-TuneWeave-Credential` headers and remain only in main-process memory.
- Authentication responses are intercepted in the main process: `caller_credential.value` is stored and redacted before the response reaches the renderer.
- Arbitrary relative TuneWeave paths are supported, so the transport is not limited to a hand-written endpoint allowlist.
- TuneWeave JSON envelopes and HTTP errors are preserved for the renderer.
- Media streams are registered with a localhost proxy that forwards required TuneWeave media headers and byte ranges.

## Runtime operations

| Operation | Purpose |
| --- | --- |
| `request` | Call any relative TuneWeave HTTP endpoint. |
| `configure` | Set the API base URL. Credentials are never accepted from ordinary renderer storage. |
| `status` | Read connection state and credential count without exposing credential values. |
| `health` | Check `/healthz` without credentials. |
| `media:register` | Convert a `MediaStream` into a localhost URL suitable for the audio and download engines. |

The default API base is `http://127.0.0.1:7832`. It can also be overridden at process start with `TUNEWEAVE_API_BASE`.

## Implemented application paths

### Search and models

- Unified search for tracks, albums, artists and playlists through `GET /v1/search`.
- Correct handling of TuneWeave discriminated resources shaped as `{ type, data }`.
- Mapping of TuneWeave resource references, artists, albums, aliases, covers, durations and pagination into SPlayer models.
- Existing Netease, QQ Music and Kugou providers remain available as an optional fallback.

### Playback and downloads

- Online playback resolves through `GET /v1/tracks/{ref}/stream`.
- TuneWeave media headers, expiry, byte ranges and trial metadata are honored.
- Playback platform and ordered fallback-platform preferences are forwarded.
- Downloads use the same header-aware localhost media path and retain known format and size metadata.

### Lyrics

- Lyrics resolve through `GET /v1/tracks/{ref}/lyrics?word_synced=true`.
- Word-synced lyrics are preferred, with plain lyrics as fallback.
- Translation and romanization tracks are preserved separately.

### Login and connection settings

- SPlayer settings expose the TuneWeave base URL, account alias and credential mode.
- Connection health can be tested from the application.
- QR login creates and polls TuneWeave authentication transactions.
- Both direct QR images and QR content/URLs are supported; content is rendered locally with `uqr`.
- Caller credentials returned by client/both mode never enter `localStorage` or `sessionStorage`.

## Remaining native UI work

The transport can call every documented relative endpoint, but dedicated SPlayer pages are still required for:

1. Password, SMS challenge, security-challenge and session-management flows.
2. Account profile, memberships, favorites, listening history and cloud-library operations.
3. Recommendations, charts, radio and personal FM.
4. Uni Playlist creation, editing, materialization and cross-platform status.
5. Podcasts, episodes, videos, subtitles and platform extensions.
6. Generated endpoint coverage checks based on TuneWeave `routes.json`.
