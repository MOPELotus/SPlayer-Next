export type TuneWeaveHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type TuneWeaveQueryValue = string | number | boolean | null | undefined;

/** 渲染进程提交给主进程的 TuneWeave HTTP 请求。 */
export interface TuneWeaveRequest {
  method?: TuneWeaveHttpMethod;
  /** 只接受相对路径，例如 /v1/search 或 /healthz。 */
  path: string;
  query?: Record<string, TuneWeaveQueryValue | TuneWeaveQueryValue[]>;
  body?: unknown;
  headers?: Record<string, string>;
  /** 是否附加当前调用方凭证，默认 true。 */
  includeCredentials?: boolean;
}

export interface TuneWeavePagination {
  limit?: number;
  offset?: number;
  total?: number | null;
  next_offset?: number | null;
  has_more?: boolean;
  next_page?: number | null;
  next_cursor?: string | null;
  extensions?: Record<string, unknown>;
}

export interface TuneWeaveMeta {
  request_id?: string;
  platform?: string;
  account?: string;
  cached?: boolean;
  pagination?: TuneWeavePagination;
  [key: string]: unknown;
}

export interface TuneWeaveErrorData {
  code: string;
  message: string;
  platform?: string;
  retryable?: boolean;
  details?: unknown;
}

export type TuneWeaveEnvelope<T> =
  | { ok: true; data: T; meta?: TuneWeaveMeta }
  | { ok: false; error: TuneWeaveErrorData; meta?: TuneWeaveMeta };

export interface TuneWeaveArtistBrief {
  ref?: string;
  id?: string;
  name: string;
  avatar_url?: string | null;
  extensions?: Record<string, unknown>;
}

export interface TuneWeaveAlbumBrief {
  ref?: string;
  id?: string;
  name: string;
  cover_url?: string | null;
  artists?: TuneWeaveArtistBrief[];
  artist?: string | null;
  track_count?: number | null;
  release_date?: string | null;
  extensions?: Record<string, unknown>;
}

export interface TuneWeaveTrack {
  ref: string;
  platform: string;
  id: string;
  name: string;
  aliases?: string[];
  artists?: TuneWeaveArtistBrief[];
  album?: TuneWeaveAlbumBrief | null;
  duration_ms?: number | null;
  isrc?: string | null;
  mv_ref?: string | null;
  playable?: boolean | null;
  available_qualities?: string[];
  extensions?: Record<string, unknown>;
}

export interface TuneWeaveAlbum extends TuneWeaveAlbumBrief {
  ref: string;
  platform: string;
  id: string;
  description?: string | null;
}

export interface TuneWeaveArtist extends TuneWeaveArtistBrief {
  ref: string;
  platform: string;
  id: string;
  album_count?: number | null;
  track_count?: number | null;
  description?: string | null;
}

export interface TuneWeavePlaylist {
  ref: string;
  platform: string;
  id: string;
  name: string;
  cover_url?: string | null;
  description?: string | null;
  track_count?: number | null;
  owner?: { ref?: string; name?: string } | string | null;
  extensions?: Record<string, unknown>;
}

export interface TuneWeaveResource<T = unknown> {
  type: string;
  data: T;
}

export interface TuneWeaveLyrics {
  track_ref?: string;
  plain?: string | null;
  translated?: string | null;
  romanized?: string | null;
  word_synced?: string | null;
  singing_annotations?: string | null;
  singing_annotations_timestamp?: unknown;
  format?: string | null;
  contributors?: unknown[];
  extensions?: Record<string, unknown>;
}

/** TuneWeave 返回的媒体描述。 */
export interface TuneWeaveMediaStream {
  url: string;
  backup_urls?: string[];
  headers?: Record<string, string>;
  expires_at?: string | number | null;
  format?: string | null;
  codec?: string | null;
  bitrate?: number | null;
  size?: number | null;
  duration_ms?: number | null;
  requested_quality?: string | null;
  actual_quality?: string | null;
  trial?: unknown;
  origin_track?: string | null;
  resolved_track?: string | null;
  resolved_platform?: string | null;
  match_score?: number | null;
  attempts?: unknown[];
  [key: string]: unknown;
}

export interface TuneWeaveQrTransaction {
  transaction_id: string;
  status?: "waiting" | "scanned" | "confirmed" | "expired" | "failed" | string;
  qr_content?: string | null;
  qr_url?: string | null;
  expires_at?: string | number | null;
  caller_credential?: { value?: string; platform?: string; expires_at?: string | null } | null;
  profile?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** 主进程内存中的连接配置。凭证不会写入常规设置文件。 */
export interface TuneWeaveRuntimeConfig {
  baseUrl?: string;
  credentials?: string[];
}

export interface TuneWeaveRuntimeStatus {
  baseUrl: string;
  credentialCount: number;
  mediaProxyPort: number | null;
}

export interface TuneWeaveMediaRegistration {
  url: string;
  expiresAt: number;
}
