import localforage from "localforage";
import type { Track } from "@shared/types/player";
import { fetchDailySongs } from "@/apis/recommend";
import { useUserStore } from "@/stores/user";
import { getTuneWeavePreferences } from "@/services/tuneweave";

const MAX_SEARCH_HISTORY = 20;
/** 每日推荐归档保留天数 */
const MAX_DAILY_ARCHIVE = 14;

const cacheDb = localforage.createInstance({ name: "splayer", storeName: "data-cache" });

/** 每日推荐逻辑日切换时刻：每日 6:00 更新，0-6 点仍算前一天 */
const DAILY_REFRESH_HOUR = 6;

/** 每日推荐逻辑日 key */
const todayKey = (): string =>
  new Date(Date.now() - DAILY_REFRESH_HOUR * 3600 * 1000).toDateString();

/** 一天的每日推荐 */
export interface DailyRecommendEntry {
  /** 本地日期 key（Date.toDateString()，可被 new Date() 解析回 Date） */
  date: string;
  /** 当天推荐曲目 */
  tracks: Track[];
}

/**
 * 通用本地数据 store
 * 用于沉淀那些跨页面、需持久化、但不归属任何业务模块的小块数据
 */
export const useDataStore = defineStore(
  "data",
  () => {
    /** 搜索历史（最新在前，去重，最多 20 条） */
    const searchHistory = ref<string[]>([]);

    /** 写入搜索历史 */
    const addSearchHistory = (keyword: string): void => {
      const word = keyword.trim();
      if (!word) return;
      const next = [word, ...searchHistory.value.filter((existing) => existing !== word)];
      if (next.length > MAX_SEARCH_HISTORY) next.length = MAX_SEARCH_HISTORY;
      searchHistory.value = next;
    };

    /** 移除某条搜索历史 */
    const removeSearchHistory = (keyword: string): void => {
      searchHistory.value = searchHistory.value.filter((existing) => existing !== keyword);
    };

    /** 清空搜索历史 */
    const clearSearchHistory = (): void => {
      searchHistory.value = [];
    };

    const user = useUserStore();

    /** 每日推荐归档 */
    let dailyArchive: DailyRecommendEntry[] = [];
    /** 当前内存归档归属的账户身份。 */
    let dailyArchiveOwnerKey: string | null = null;
    /** 今日每日推荐曲目 */
    const dailyRecommend = shallowRef<Track[]>([]);
    /** 历史每日推荐（不含今日，最新在前） */
    const dailyHistory = shallowRef<DailyRecommendEntry[]>([]);
    /** 进行中的拉取，去重并发调用 */
    let dailyRecommendLoading: Promise<Track[]> | null = null;

    /** 用归档刷新今日 / 历史两个对外 ref */
    const syncDaily = (): void => {
      const head = dailyArchive[0];
      const todayReady = head?.date === todayKey();
      dailyRecommend.value = todayReady ? (head?.tracks ?? []) : [];
      dailyHistory.value = todayReady ? dailyArchive.slice(1) : dailyArchive;
    };

    /**
     * 生成推荐缓存身份。
     * TuneWeave 启用时不依赖 SPlayer 原网易云登录；server 模式按账户别名隔离，
     * client/both 模式按平台会话隔离。TuneWeave 禁用时沿用网易云 userId。
     */
    const dailyOwnerKey = (): string | null => {
      const tuneWeave = getTuneWeavePreferences();
      if (tuneWeave.enabled) {
        const accountKey =
          tuneWeave.credentialMode === "server" ? tuneWeave.account : tuneWeave.credentialMode;
        return `tuneweave:${tuneWeave.accountPlatform}:${accountKey}`;
      }
      const uid = user.profile?.userId;
      return uid == null ? null : `netease:${uid}`;
    };

    /**
     * 取每日推荐曲目：当天已有直接返回，否则按 IndexedDB → 网络 顺序获取
     * 缓存按当前推荐账户身份分键。
     * 新一天的数据会把旧数据沉淀进历史归档（IndexedDB 持久化，保留近 14 天）
     * 逻辑日以 6:00 为界，失败返回空数组。各处可直接调用，已就绪时即时返回
     * TuneWeave 启用时优先调用统一推荐端点，并按设置回退原网易云接口。
     * @param force - 强制重新拉取并覆盖当天归档
     */
    const ensureDailyRecommend = async (force = false): Promise<Track[]> => {
      const ownerKey = dailyOwnerKey();
      if (!ownerKey) return [];
      // 账户切换 → 丢弃旧账户的内存归档，避免串数据
      if (dailyArchiveOwnerKey !== ownerKey) {
        dailyArchive = [];
        dailyArchiveOwnerKey = ownerKey;
        dailyRecommend.value = [];
        dailyHistory.value = [];
      }
      const cacheKey = `daily-recommend-archive:${ownerKey}`;
      const head = dailyArchive[0];
      if (!force && head?.date === todayKey() && head.tracks.length > 0) {
        return dailyRecommend.value;
      }
      if (dailyRecommendLoading) return dailyRecommendLoading;
      dailyRecommendLoading = (async () => {
        try {
          if (dailyArchive.length === 0) {
            const cached = await cacheDb.getItem<DailyRecommendEntry[]>(cacheKey).catch(() => null);
            if (cached?.length) {
              dailyArchive = cached;
              syncDaily();
            }
          }
          const cachedHead = dailyArchive[0];
          if (!force && cachedHead?.date === todayKey() && cachedHead.tracks.length > 0) {
            return dailyRecommend.value;
          }
          const tracks = await fetchDailySongs();
          if (tracks.length > 0) {
            // 当天已在归档则覆盖，否则前插为新的一天
            const rest =
              dailyArchive[0]?.date === todayKey() ? dailyArchive.slice(1) : dailyArchive;
            dailyArchive = [{ date: todayKey(), tracks }, ...rest].slice(0, MAX_DAILY_ARCHIVE);
            syncDaily();
            cacheDb.setItem(cacheKey, dailyArchive).catch(() => {});
          }
          return dailyRecommend.value;
        } catch (error) {
          console.warn("[data] daily recommend failed:", error);
          return dailyRecommend.value;
        } finally {
          dailyRecommendLoading = null;
        }
      })();
      return dailyRecommendLoading;
    };

    return {
      searchHistory,
      addSearchHistory,
      removeSearchHistory,
      clearSearchHistory,
      dailyRecommend,
      dailyHistory,
      ensureDailyRecommend,
    };
  },
  {
    persist: {
      storage: localStorage,
      pick: ["searchHistory"],
    },
  },
);
