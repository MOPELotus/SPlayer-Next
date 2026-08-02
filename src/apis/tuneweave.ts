import type { ApiCallResponse } from "@shared/types/apis";
import type {
  TuneWeaveEnvelope,
  TuneWeaveMediaRegistration,
  TuneWeaveMediaStream,
  TuneWeaveRequest,
  TuneWeaveRuntimeConfig,
  TuneWeaveRuntimeStatus,
} from "@shared/types/tuneweave";

export class TuneWeaveApiError extends Error {
  readonly status?: number;
  readonly body?: unknown;
  readonly code?: string;
  readonly retryable?: boolean;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "TuneWeaveApiError";
    this.status = status;
    this.body = body;
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error?: { code?: unknown; retryable?: unknown } }).error;
      this.code = typeof error?.code === "string" ? error.code : undefined;
      this.retryable = typeof error?.retryable === "boolean" ? error.retryable : undefined;
    }
  }
}

const invoke = async <T>(name: string, params?: Record<string, unknown>): Promise<T> => {
  const response: ApiCallResponse = await window.api.apis.call("tuneweave", name, params);
  if (!response.ok) {
    throw new TuneWeaveApiError(response.error, response.status, response.body);
  }
  return response.data as T;
};

/** 配置主进程中的 TuneWeave 连接。调用方凭证只驻留内存。 */
export const configureTuneWeave = (
  config: TuneWeaveRuntimeConfig,
): Promise<TuneWeaveRuntimeStatus> =>
  invoke("configure", config as unknown as Record<string, unknown>);

export const getTuneWeaveStatus = (): Promise<TuneWeaveRuntimeStatus> => invoke("status");

export const checkTuneWeaveHealth = (): Promise<unknown> => invoke("health");

/** 调用任意 TuneWeave HTTP API，保留 JSON、文本或二进制原始响应。 */
export const tuneweaveRawRequest = <T>(request: TuneWeaveRequest): Promise<T> =>
  invoke("request", request as unknown as Record<string, unknown>);

/** 调用标准业务 API，返回完整统一 JSON 包络。 */
export const tuneweaveRequest = <T>(request: TuneWeaveRequest): Promise<TuneWeaveEnvelope<T>> =>
  tuneweaveRawRequest<TuneWeaveEnvelope<T>>(request);

/** 调用业务 API 并直接取 data；统一错误包络会转为异常。 */
export const tuneweaveData = async <T>(request: TuneWeaveRequest): Promise<T> => {
  const envelope = await tuneweaveRequest<T>(request);
  if (!envelope.ok) {
    throw new TuneWeaveApiError(envelope.error.message, undefined, envelope);
  }
  return envelope.data;
};

/** 注册一个带请求头的短期媒体 URL，返回音频引擎可直接读取的本地地址。 */
export const registerTuneWeaveMedia = (
  stream: TuneWeaveMediaStream,
): Promise<TuneWeaveMediaRegistration> =>
  invoke("media:register", { stream } as unknown as Record<string, unknown>);

export const clearTuneWeaveCredentials = (): Promise<void> =>
  window.api.apis.clearSession("tuneweave");
