"use client";

/**
 * 曲目库读取（对接最终契约）：
 * - listCachedSongs() → { listener: [{title, artist}], creator: [{title, artist}] }
 * - getCachedScript(title) → 单首完整剧本 或 null
 * 维度 key 为中文四个：唱 / 词 / 曲 / 编。
 * 浏览器预览无宿主注入时安全降级为示例数据，绝不抛错。
 * 同时兼容旧的「歌名 - 歌手」字符串格式，避免过渡期渲染出 [object Object]。
 */

export type SongRole = "listener" | "creator";

export type Song = { title: string; artist: string };

export type CachedSongs = {
  listener: Song[];
  creator: Song[];
};

/** AI 剧本：渲染唯一对象 */
export type ScriptHighlight = {
  time: number;
  core: string;
  唱: string;
  词: string;
  曲: string;
  编: string;
};
export type Script = {
  summary: string;
  highlights: ScriptHighlight[];
  mode: "listener" | "creator";
};

type ZhiyinApi = {
  listCachedSongs?: () =>
    | CachedSongs
    | Promise<CachedSongs>
    // 兼容旧字符串数组格式
    | { listener: string[]; creator: string[] }
    | Promise<{ listener: string[]; creator: string[] }>;
  getCachedScript?: (title: string) => Script | null | Promise<Script | null>;
  sendBuiltinSource?: (p: {
    title: string;
    artist: string;
    isPlaying: boolean;
    positionSec: number;
    duration?: number;
  }) => void;
  onSource?: (cb: (s: {
    channel: string;
    title: string;
    artist: string;
    isPlaying: boolean;
    positionSec: number;
    duration: number;
    at: number;
  }) => void) => () => void;
  onScript?: (cb: (d: { key: string; script: Script }) => void) => () => void;
  resizeBall?: (mode: "idle" | "card", height: number) => void;
  moveBall?: (dx: number, dy: number) => void;
  searchTerm?: (term: string) => void;
  getNcmStatus?: () => Promise<NcmStatus | null>;
  installNcmPlugin?: () => Promise<{ ok: boolean; dest?: string; error?: string }>;
  openNcmDownload?: () => void;
  openInflinkDownload?: () => void;
  onNcmStatus?: (cb: (s: NcmStatus) => void) => () => void;
};

export type NcmStatus = {
  connected: boolean;
  port: number;
  betterNcmInstalled: boolean;
  inflinkInstalled: boolean;
  pluginInstalled: boolean;
};

declare global {
  interface Window {
    api?: ZhiyinApi;
  }
}

/** 把任意条目（对象或「歌名 - 歌手」字符串）规范化为 {title, artist} */
function normalize(item: unknown): Song | null {
  if (!item) return null;
  if (typeof item === "string") {
    const parts = item.split(" - ");
    return { title: (parts[0] ?? item).trim(), artist: (parts[1] ?? "").trim() };
  }
  if (typeof item === "object") {
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : "";
    const artist = typeof o.artist === "string" ? o.artist : "";
    if (!title && !artist) return null;
    return { title, artist };
  }
  return null;
}

function normalizeList(arr: unknown): Song[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalize).filter((s): s is Song => s !== null);
}

/** 浏览器预览无宿主时的示例数据 */
const DEMO: CachedSongs = {
  listener: [
    { title: "起风了", artist: "买辣椒也用券" },
    { title: "晴天", artist: "周杰伦" },
    { title: "夜曲", artist: "周杰伦" },
    { title: "successes", artist: "无损" },
  ],
  creator: [
    { title: "我的demo小样", artist: "未命名" },
    { title: "深夜写的一段旋律", artist: "草稿" },
  ],
};

export async function loadCachedSongs(): Promise<CachedSongs> {
  try {
    const api = typeof window !== "undefined" ? window.api : undefined;
    if (api?.listCachedSongs) {
      const res = await api.listCachedSongs();
      return {
        listener: normalizeList((res as CachedSongs)?.listener),
        creator: normalizeList((res as CachedSongs)?.creator),
      };
    }
  } catch {
    // 宿主接口异常时降级
  }
  return DEMO;
}

/** 按歌名取单首完整剧本；无宿主或不存在返回 null */
export async function getCachedScript(title: string): Promise<Script | null> {
  try {
    const api = typeof window !== "undefined" ? window.api : undefined;
    if (api?.getCachedScript) {
      return (await api.getCachedScript(title)) ?? null;
    }
  } catch {
    // 忽略
  }
  return null;
}
