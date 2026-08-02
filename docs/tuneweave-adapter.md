# TuneWeave native adapter

This fork treats TuneWeave as a first-class backend instead of exposing platform APIs directly to the renderer.

## Architecture

- Renderer requests go through `window.api.apis.call("tuneweave", ...)`.
- The Electron main process owns the TuneWeave base URL and caller credentials.
- Caller credentials are repeatable `X-TuneWeave-Credential` headers and remain only in main-process memory.
- Authentication responses are intercepted in the main process: `caller_credential.value` is stored and redacted before the response reaches the renderer.
- Arbitrary relative TuneWeave paths are supported, so the transport is not limited to a hand-written endpoint allowlist.
- TuneWeave JSON envelopes and HTTP errors are preserved for the renderer.
- JSON, plain-text and multipart request bodies are supported.
- JSON, text and binary responses are supported; binary bytes cross IPC as `Uint8Array` rather than being expanded into JSON.
- Media streams are registered with a localhost proxy that forwards required TuneWeave media headers and byte ranges.

## Runtime operations

| Operation        | Purpose                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `request`        | Call any relative TuneWeave HTTP endpoint.                                                |
| `configure`      | Set the API base URL. Credentials are never accepted from ordinary renderer storage.      |
| `status`         | Read connection state and credential count without exposing credential values.            |
| `health`         | Check `/healthz` without credentials.                                                     |
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

### Recommendations

- Daily tracks, Personal FM and recommended playlists use TuneWeave when enabled.
- Homepage recommendation caches are isolated by TuneWeave platform and account identity.
- A TuneWeave-only session does not depend on SPlayer's legacy Netease user store.

### Login and account

- SPlayer settings expose the TuneWeave base URL, account platform, account alias and credential mode.
- Connection health can be tested from the application.
- QR login creates and polls TuneWeave authentication transactions.
- Both direct QR images and QR content/URLs are supported; content is rendered locally with `uqr`.
- Caller credentials returned by client/both mode never enter `localStorage` or `sessionStorage`.
- Account profile, membership, session state, refresh/logout, playlists and favorite tracks can be read from the settings account card.

### Uni Playlist

- A native page lists, creates and deletes Uni Playlists.
- Items can be listed, appended and removed.
- Track items are converted into SPlayer tracks and reuse the normal TuneWeave playback path.
- V1 JSON documents can be exported from the page.

### Complete endpoint surface

- The route catalog pins all 259 unique `method + path` entries from TuneWeave `v0.1.0-alpha.3`.
- An in-app API console provides route/category search, path parameters, query JSON, JSON/text/multipart bodies, caller-credential selection, automatic or forced response decoding, binary saving and request history.
- File uploads are selected by the user and sent as bytes through structured IPC; the renderer cannot submit arbitrary local file paths.
- Protected headers such as credentials, cookies, authorization, host and content length cannot be supplied by the renderer.

## Tests and validation

- Main-process tests cover URL construction, credential limits/redaction, request-body encoding, multipart validation and binary response decoding.
- Renderer tests cover discriminated resource mapping, Uni Playlist snapshots and the 259-route count/uniqueness invariant.
- A fork-only workflow runs Prettier, ESLint, TypeScript and tests when GitHub Actions is enabled for the fork.
- GitHub Actions has not produced a run for the current fork, so the adapter branch remains a draft and is not considered merge-ready.

## Remaining native UI work

The transport and API console can call every pinned route, while dedicated SPlayer pages are still useful for:

1. Password, SMS challenge, security-challenge and session-management workflows beyond the existing account card.
2. Rich account library/history/cloud operations.
3. Charts, radio and additional recommendation surfaces.
4. Podcasts, episodes, videos, subtitles and comments.
5. Platform-extension-specific forms and response renderers.
6. Full format/lint/typecheck/test and real-account end-to-end validation once the fork build environment is available.
