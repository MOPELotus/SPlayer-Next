<script setup lang="ts">
import type {
  TuneWeaveBinaryResponse,
  TuneWeaveBodyType,
  TuneWeaveHttpMethod,
  TuneWeaveMultipartBody,
  TuneWeaveMultipartFile,
  TuneWeaveQueryValue,
  TuneWeaveResponseType,
} from "@shared/types/tuneweave";
import { tuneweaveRawRequest } from "@/apis/tuneweave";
import {
  TUNEWEAVE_ROUTES,
  TUNEWEAVE_ROUTE_SOURCE_RELEASE,
  type TuneWeaveRouteDefinition,
} from "@/data/tuneweave-routes";
import { ensureTuneWeaveConfigured } from "@/services/tuneweave";
import IconLucideDownload from "~icons/lucide/download";
import IconLucideSend from "~icons/lucide/send";

interface ConsoleHistoryEntry {
  id: string;
  method: TuneWeaveHttpMethod;
  path: string;
  ok: boolean;
  durationMs: number;
  at: number;
}

const keyword = ref("");
const category = ref("all");
const selectedKey = ref("GET /healthz");
const pathValues = reactive<Record<string, string>>({});
const queryText = ref("{}");
const bodyType = ref<TuneWeaveBodyType>("json");
const responseType = ref<TuneWeaveResponseType>("auto");
const bodyText = ref("{}");
const multipartFieldsText = ref("{}");
const multipartFileField = ref("file");
const selectedFiles = shallowRef<File[]>([]);
const includeCredentials = ref(true);
const sending = ref(false);
const responseText = ref("");
const binaryResponse = shallowRef<TuneWeaveBinaryResponse | null>(null);
const history = shallowRef<ConsoleHistoryEntry[]>([]);

const categories = computed(() => [
  "all",
  ...Array.from(new Set(TUNEWEAVE_ROUTES.map((route) => route.category))).sort(),
]);

const filteredRoutes = computed(() => {
  const needle = keyword.value.trim().toLowerCase();
  return TUNEWEAVE_ROUTES.filter((route) => {
    if (category.value !== "all" && route.category !== category.value) return false;
    if (!needle) return true;
    return `${route.method} ${route.path} ${route.category}`.toLowerCase().includes(needle);
  });
});

const routeKey = (route: TuneWeaveRouteDefinition): string => `${route.method} ${route.path}`;

const selectedRoute = computed(
  () => TUNEWEAVE_ROUTES.find((route) => routeKey(route) === selectedKey.value) ?? null,
);

const pathParameters = computed(() => {
  const names = new Set<string>();
  for (const match of selectedRoute.value?.path.matchAll(/\{([^}]+)\}/g) ?? []) {
    names.add(match[1]);
  }
  return [...names];
});

const resolvedPath = computed(() => {
  const template = selectedRoute.value?.path ?? "";
  return template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = pathValues[name]?.trim();
    return value ? encodeURIComponent(value) : `{${name}}`;
  });
});

const hasBody = computed(() => {
  const method = selectedRoute.value?.method;
  return method !== undefined && method !== "GET" && method !== "HEAD";
});

const destructive = computed(() => {
  const method = selectedRoute.value?.method;
  return method === "DELETE" || method === "PUT" || method === "PATCH";
});

const parseJsonObject = (raw: string, label: string): Record<string, unknown> => {
  if (!raw.trim()) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
};

const parseQuery = (): Record<
  string,
  TuneWeaveQueryValue | TuneWeaveQueryValue[]
> => {
  const input = parseJsonObject(queryText.value, "Query");
  const output: Record<string, TuneWeaveQueryValue | TuneWeaveQueryValue[]> = {};
  for (const [key, value] of Object.entries(input)) {
    const valid =
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (Array.isArray(value) &&
        value.every(
          (item) =>
            item === null ||
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        ));
    if (!valid) throw new Error(`Query.${key} 只能是标量或标量数组`);
    output[key] = value as TuneWeaveQueryValue | TuneWeaveQueryValue[];
  }
  return output;
};

const parseMultipartFields = (): Record<string, string | string[]> => {
  const input = parseJsonObject(multipartFieldsText.value, "Multipart fields");
  const fields: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      fields[key] = value as string[];
      continue;
    }
    throw new Error(`Multipart fields.${key} 只能是字符串或字符串数组`);
  }
  return fields;
};

const buildMultipartFiles = async (): Promise<TuneWeaveMultipartFile[]> => {
  const field = multipartFileField.value.trim();
  if (selectedFiles.value.length > 0 && !field) throw new Error("请输入文件字段名");
  return Promise.all(
    selectedFiles.value.map(async (file) => ({
      field,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
};

const buildRequestBody = async (): Promise<unknown> => {
  if (!hasBody.value) return undefined;
  if (bodyType.value === "json") return parseJsonObject(bodyText.value, "Body");
  if (bodyType.value === "text") return bodyText.value;
  const multipart: TuneWeaveMultipartBody = {
    fields: parseMultipartFields(),
    files: await buildMultipartFiles(),
  };
  return multipart;
};

const isBinaryResponse = (value: unknown): value is TuneWeaveBinaryResponse =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as { kind?: unknown }).kind === "binary" &&
  (value as { bytes?: unknown }).bytes instanceof Uint8Array;

const resetPathValues = (): void => {
  for (const key of Object.keys(pathValues)) delete pathValues[key];
  for (const name of pathParameters.value) pathValues[name] = "";
};

watch(selectedKey, () => {
  resetPathValues();
  responseText.value = "";
  binaryResponse.value = null;
  selectedFiles.value = [];
});

const selectRoute = (route: TuneWeaveRouteDefinition): void => {
  selectedKey.value = routeKey(route);
};

const onFilesSelected = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  selectedFiles.value = Array.from(input.files ?? []);
};

const clearFiles = (): void => {
  selectedFiles.value = [];
};

const formatResponse = (response: unknown): boolean => {
  binaryResponse.value = null;
  if (isBinaryResponse(response)) {
    binaryResponse.value = response;
    responseText.value = JSON.stringify(
      {
        kind: response.kind,
        status: response.status,
        contentType: response.contentType,
        contentDisposition: response.contentDisposition,
        fileName: response.fileName,
        size: response.bytes.byteLength,
      },
      null,
      2,
    );
    return true;
  }
  const serialized = JSON.stringify(response, null, 2);
  responseText.value = typeof response === "string" ? response : (serialized ?? String(response));
  if (response && typeof response === "object" && "ok" in response) {
    return (response as { ok?: unknown }).ok === true;
  }
  return true;
};

const downloadBinaryResponse = (): void => {
  const response = binaryResponse.value;
  if (!response) return;
  const copied = new Uint8Array(response.bytes).buffer;
  const blob = new Blob([copied], { type: response.contentType });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = response.fileName || "tuneweave-response.bin";
  anchor.click();
  URL.revokeObjectURL(url);
};

const sendRequest = async (): Promise<void> => {
  const route = selectedRoute.value;
  if (!route) return;
  const missing = pathParameters.value.filter((name) => !pathValues[name]?.trim());
  if (missing.length > 0) {
    responseText.value = JSON.stringify(
      { error: `缺少路径参数：${missing.join(", ")}` },
      null,
      2,
    );
    return;
  }

  sending.value = true;
  binaryResponse.value = null;
  const startedAt = performance.now();
  let ok = false;
  try {
    await ensureTuneWeaveConfigured();
    const query = parseQuery();
    const body = await buildRequestBody();
    const response = await tuneweaveRawRequest<unknown>({
      method: route.method,
      path: resolvedPath.value,
      query,
      bodyType: hasBody.value ? bodyType.value : undefined,
      body,
      responseType: responseType.value,
      includeCredentials: includeCredentials.value,
    });
    ok = formatResponse(response);
  } catch (error) {
    const body =
      error && typeof error === "object" && "body" in error
        ? (error as { body?: unknown }).body
        : undefined;
    responseText.value = JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        body,
      },
      null,
      2,
    );
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    history.value = [
      {
        id: crypto.randomUUID(),
        method: route.method,
        path: resolvedPath.value,
        ok,
        durationMs,
        at: Date.now(),
      },
      ...history.value,
    ].slice(0, 30);
    sending.value = false;
  }
};

onMounted(resetPathValues);
</script>

<template>
  <div class="h-full overflow-hidden px-5 pb-5">
    <div class="mx-auto h-full max-w-7xl flex flex-col gap-4">
      <header class="shrink-0 flex items-end justify-between gap-4 pt-2">
        <div>
          <div class="text-xs font-medium text-primary">
            TuneWeave {{ TUNEWEAVE_ROUTE_SOURCE_RELEASE }}
          </div>
          <h1 class="mt-1 text-2xl font-bold text-on-surface">API 控制台</h1>
          <p class="mt-1 text-sm text-on-surface-variant/60">
            {{ TUNEWEAVE_ROUTES.length }} 条固定路由；用于验证专用 UI 尚未覆盖的低频与平台扩展端点
          </p>
        </div>
        <div class="text-xs text-on-surface-variant/55">
          请求经 Electron 主进程发送，调用方凭证不会暴露给页面
        </div>
      </header>

      <div class="min-h-0 flex-1 grid grid-cols-[340px_minmax(0,1fr)] gap-4">
        <aside
          class="min-h-0 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel p-3 flex flex-col gap-3"
        >
          <div class="grid grid-cols-[1fr_120px] gap-2">
            <input
              v-model="keyword"
              class="h-9 min-w-0 rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 text-sm text-on-surface outline-none focus:border-primary"
              placeholder="搜索 method / path"
            />
            <select
              v-model="category"
              class="h-9 rounded-lg border border-solid border-outline-variant/25 bg-surface px-2 text-sm text-on-surface"
            >
              <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto flex flex-col gap-1">
            <button
              v-for="route in filteredRoutes"
              :key="routeKey(route)"
              class="w-full border-none rounded-lg bg-transparent px-2.5 py-2 text-left cursor-pointer transition-colors"
              :class="
                routeKey(route) === selectedKey
                  ? 'bg-primary/12 text-primary'
                  : 'text-on-surface hover:bg-on-surface/6'
              "
              @click="selectRoute(route)"
            >
              <div class="flex items-center gap-2">
                <span class="w-14 shrink-0 text-[11px] font-semibold">{{ route.method }}</span>
                <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ route.path }}</span>
              </div>
              <div class="mt-1 pl-16 text-[10px] opacity-50">{{ route.category }}</div>
            </button>
          </div>
          <div class="shrink-0 text-xs text-on-surface-variant/45">
            筛选结果 {{ filteredRoutes.length }} / {{ TUNEWEAVE_ROUTES.length }}
          </div>
        </aside>

        <main class="min-h-0 grid grid-rows-[auto_minmax(0,1fr)] gap-4">
          <section
            class="rounded-xl border border-solid border-outline-variant/15 bg-surface-panel p-4 flex flex-col gap-3"
          >
            <div class="flex items-center gap-3">
              <STag
                :type="destructive ? 'warning' : 'primary'"
                variant="soft"
                class="font-mono"
              >
                {{ selectedRoute?.method }}
              </STag>
              <code class="min-w-0 flex-1 truncate text-sm text-on-surface">{{ resolvedPath }}</code>
              <select
                v-if="hasBody"
                v-model="bodyType"
                class="h-8 rounded-lg border border-solid border-outline-variant/25 bg-surface px-2 text-xs text-on-surface"
                title="请求体类型"
              >
                <option value="json">JSON</option>
                <option value="text">Text</option>
                <option value="multipart">Multipart</option>
              </select>
              <select
                v-model="responseType"
                class="h-8 rounded-lg border border-solid border-outline-variant/25 bg-surface px-2 text-xs text-on-surface"
                title="响应类型"
              >
                <option value="auto">响应：自动</option>
                <option value="json">响应：JSON</option>
                <option value="text">响应：文本</option>
                <option value="bytes">响应：字节</option>
              </select>
              <label class="flex items-center gap-2 text-xs text-on-surface-variant">
                <SSwitch v-model="includeCredentials" />
                附加会话凭证
              </label>
            </div>

            <div v-if="pathParameters.length > 0" class="grid grid-cols-2 gap-2">
              <label v-for="name in pathParameters" :key="name" class="flex flex-col gap-1">
                <span class="text-[11px] text-on-surface-variant/60">路径参数 {{ name }}</span>
                <input
                  v-model="pathValues[name]"
                  class="h-9 rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 font-mono text-xs text-on-surface outline-none focus:border-primary"
                  :placeholder="name"
                />
              </label>
            </div>

            <div class="grid gap-3" :class="hasBody ? 'grid-cols-2' : 'grid-cols-1'">
              <label class="flex flex-col gap-1">
                <span class="text-[11px] text-on-surface-variant/60">Query JSON</span>
                <textarea
                  v-model="queryText"
                  spellcheck="false"
                  class="min-h-32 resize-y rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary"
                />
              </label>

              <label v-if="hasBody && bodyType === 'json'" class="flex flex-col gap-1">
                <span class="text-[11px] text-on-surface-variant/60">Body JSON</span>
                <textarea
                  v-model="bodyText"
                  spellcheck="false"
                  class="min-h-32 resize-y rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary"
                />
              </label>

              <label v-else-if="hasBody && bodyType === 'text'" class="flex flex-col gap-1">
                <span class="text-[11px] text-on-surface-variant/60">Text body</span>
                <textarea
                  v-model="bodyText"
                  spellcheck="false"
                  class="min-h-32 resize-y rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary"
                />
              </label>

              <div v-else-if="hasBody" class="flex min-h-32 flex-col gap-2">
                <label class="flex flex-col gap-1">
                  <span class="text-[11px] text-on-surface-variant/60">Multipart fields JSON</span>
                  <textarea
                    v-model="multipartFieldsText"
                    spellcheck="false"
                    class="min-h-20 resize-y rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary"
                  />
                </label>
                <div class="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
                  <input
                    v-model="multipartFileField"
                    class="h-9 rounded-lg border border-solid border-outline-variant/25 bg-surface px-3 font-mono text-xs text-on-surface outline-none focus:border-primary"
                    placeholder="file 字段名"
                  />
                  <input
                    type="file"
                    multiple
                    class="h-9 min-w-0 rounded-lg border border-solid border-outline-variant/25 bg-surface px-2 py-1 text-xs text-on-surface file:mr-2 file:border-none file:rounded-md file:bg-primary/12 file:px-2 file:py-1 file:text-primary"
                    @change="onFilesSelected"
                  />
                </div>
                <div class="flex min-h-5 items-center gap-2 text-[11px] text-on-surface-variant/55">
                  <span>
                    {{ selectedFiles.length > 0 ? `已选择 ${selectedFiles.length} 个文件` : '未选择文件' }}
                  </span>
                  <button
                    v-if="selectedFiles.length > 0"
                    class="border-none bg-transparent p-0 text-primary cursor-pointer"
                    @click="clearFiles"
                  >
                    清除
                  </button>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <div class="text-xs text-on-surface-variant/55">
                <span v-if="destructive" class="text-amber-500">该方法可能修改或删除远端数据。</span>
                <span v-else-if="bodyType === 'multipart' && hasBody">
                  文件只在发送时读入内存，不写入请求历史。
                </span>
                <span v-else>未知字段会被 TuneWeave 严格拒绝，请按端点文档填写。</span>
              </div>
              <SButton type="primary" :loading="sending" @click="sendRequest">
                <template #icon><IconLucideSend /></template>
                发送请求
              </SButton>
            </div>
          </section>

          <section class="min-h-0 grid grid-cols-[minmax(0,1fr)_280px] gap-4">
            <div
              class="min-h-0 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel p-3 flex flex-col"
            >
              <div class="shrink-0 px-1 pb-2 flex items-center justify-between gap-3">
                <span class="text-xs font-medium text-on-surface-variant">响应</span>
                <SButton
                  v-if="binaryResponse"
                  size="tiny"
                  variant="secondary"
                  type="primary"
                  @click="downloadBinaryResponse"
                >
                  <template #icon><IconLucideDownload /></template>
                  保存 {{ binaryResponse.bytes.byteLength }} 字节
                </SButton>
              </div>
              <pre
                class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/25 p-3 font-mono text-xs leading-5 text-on-surface"
              >{{ responseText || "尚未发送请求" }}</pre>
            </div>
            <div
              class="min-h-0 rounded-xl border border-solid border-outline-variant/15 bg-surface-panel p-3 flex flex-col"
            >
              <div class="shrink-0 px-1 pb-2 text-xs font-medium text-on-surface-variant">本次会话历史</div>
              <div class="min-h-0 flex-1 overflow-y-auto flex flex-col gap-1.5">
                <button
                  v-for="entry in history"
                  :key="entry.id"
                  class="border-none rounded-lg bg-on-surface/4 px-2.5 py-2 text-left text-on-surface hover:bg-on-surface/8 cursor-pointer"
                  @click="keyword = entry.path"
                >
                  <div class="flex items-center gap-2 text-xs">
                    <span :class="entry.ok ? 'text-green-500' : 'text-red-500'">●</span>
                    <span class="font-semibold">{{ entry.method }}</span>
                    <span class="ml-auto tabular-nums text-on-surface-variant/50">
                      {{ entry.durationMs }} ms
                    </span>
                  </div>
                  <div class="mt-1 truncate font-mono text-[10px] text-on-surface-variant/55">
                    {{ entry.path }}
                  </div>
                </button>
                <div
                  v-if="history.length === 0"
                  class="flex flex-1 items-center justify-center text-xs text-on-surface-variant/40"
                >
                  无请求记录
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>
