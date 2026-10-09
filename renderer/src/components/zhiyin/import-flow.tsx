"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, SearchIcon } from "@/components/zhiyin/dimension-icons";
import type { SongRole } from "@/lib/zhiyin/song-library";

/**
 * 导入区：听众=导入歌单截图（OCR 识别 → 批量预生成），创作者=上传音频（现场解析）。
 * 对接 window.api 的 parseScreenshot / batchGenerate / analyzeAudio。
 * 保留 eazo 原「+ / 放大镜」双按钮视觉，点击触发隐藏的 file input，结果在按钮下方展开。
 */

type Song = { title: string; artist: string };

type BatchProgress = { done: number; total: number; title: string };
type TokenUsage = { prompt_tokens?: number; completion_tokens?: number };
type BatchItem = { title: string; artist?: string; ok?: boolean; error?: string; usage?: TokenUsage | null };
type HighlightScript = { summary?: string; highlights?: unknown[] };

type ZhiyinApi = {
  parseScreenshot?: (imageBase64: string, mime?: string) => Promise<unknown>;
  batchGenerate?: (songs: Song[]) => void;
  onBatchProgress?: (cb: (p: BatchProgress) => void) => () => void;
  onBatchDone?: (cb: (results: BatchItem[]) => void) => () => void;
  analyzeAudio?: (
    base64: string,
    format: string,
    title: string,
    artist: string,
  ) => Promise<HighlightScript | null | undefined>;
};

function getApi(): ZhiyinApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { api?: ZhiyinApi }).api;
}

/** 按规范化歌名去重，保留原始 title/artist */
function dedupeByTitle(list: unknown): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  const arr = Array.isArray(list) ? list : [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : "";
    const artist = typeof o.artist === "string" ? o.artist : "";
    // 用「歌名+歌手」去重：同一首歌多次上传只留一条，同名不同歌手（翻唱）也各自保留
    const k =
      title.toLowerCase().replace(/[^a-z0-9一-龥]/g, "") +
      "__" +
      artist.toLowerCase().replace(/[^a-z0-9一-龥]/g, "");
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push({ title, artist });
    }
  }
  return out;
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(",")[1] || "";
      const mime =
        file.type ||
        (dataUrl.split(",")[0].match(/data:(.*?);base64/)?.[1] || "") ||
        "image/png";
      resolve({ base64, mime });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 解析 txt 歌单：每行一首，支持「歌名 - 歌手」或纯歌名 */
function parseTxtPlaylist(text: string): Song[] {
  const songs: Song[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(" - ");
    if (idx > 0) {
      songs.push({ title: t.slice(0, idx).trim(), artist: t.slice(idx + 3).trim() });
    } else {
      songs.push({ title: t, artist: "" });
    }
  }
  return songs;
}

export function ImportFlow({
  role,
  onOpenImports,
}: {
  role: SongRole;
  onOpenImports: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [parsing, setParsing] = useState(false);
  const [batchResult, setBatchResult] = useState<{ ok: number; total: number; errors: string[] } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatorResult, setCreatorResult] = useState<{ count: number; summary?: string } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // 只订阅批量生成完成（静默后台生成，不显示进度）
  useEffect(() => {
    const a = getApi();
    if (!a?.onBatchDone) return;
    const off = a.onBatchDone((r) => {
      const list = Array.isArray(r) ? r : [];
      const ok = list.filter((x) => x?.ok).length;
      const errors = list
        .filter((x) => !x?.ok)
        .map((x) => `${x?.title || "?"}: ${x?.error || "未知错误"}`);
      setBatchResult({ ok, total: list.length, errors });
    });
    return () => off();
  }, []);

  function openPicker() {
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (role === "listener") await importPlaylist(file);
    else await importSong(file);
  }

  async function importPlaylist(file: File) {
    setParsing(true);
    setError("");
    setBatchResult(null);
    try {
      const isTxt = /\.(txt|text)$/i.test(file.name) || file.type === "text/plain";
      let list: Song[];
      if (isTxt) {
        const text = await file.text();
        list = dedupeByTitle(parseTxtPlaylist(text));
      } else {
        const { base64, mime } = await fileToBase64(file);
        const raw = await getApi()?.parseScreenshot?.(base64, mime);
        list = dedupeByTitle(raw);
      }
      setSongs(list);
      // 上传后静默后台生成
      if (list.length > 0) getApi()?.batchGenerate?.(list);
    } catch (err) {
      setError("识别失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setParsing(false);
    }
  }

  async function importSong(file: File) {
    const title = file.name.replace(/\.(mp3|wav|flac|m4a|aac|ogg|mp4|mov|webm|mkv|avi|m4v|flv)$/i, "");
    setAnalyzing(true);
    setError("");
    setCreatorResult(null);
    try {
      const { base64 } = await fileToBase64(file);
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const VIDEO_EXTS = ["mp4", "mov", "webm", "mkv", "avi", "m4v", "flv"];
      const format = VIDEO_EXTS.includes(ext) ? (ext === "m4v" ? "mp4" : ext) : ext === "wav" ? "wav" : "mp3";
      const script = await getApi()?.analyzeAudio?.(base64, format, title, "");
      setCreatorResult({
        count: script && script.highlights ? script.highlights.length : 0,
        summary: script && script.summary ? script.summary : undefined,
      });
    } catch (err) {
      setError("分析失败：" + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAnalyzing(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (role === "listener") void importPlaylist(file);
    else void importSong(file);
  }

  const isCreator = role === "creator";
  const actionLabel = isCreator ? "上传音频" : "导入歌单";
  const hasResult =
    parsing ||
    songs.length > 0 ||
    !!batchResult ||
    analyzing ||
    !!creatorResult ||
    !!error;

  return (
    <>
      <div data-el="import-actions" className="grid grid-cols-2 gap-[7px] pt-[6px] pb-[18px]">
        <button
          type="button"
          aria-label={actionLabel}
          data-el="import-playlist"
          onClick={openPicker}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="group flex min-h-[96px] flex-col items-center justify-center gap-0 rounded-[14px] transition-all active:scale-[0.97]"
          style={{
            border: dragOver ? "1.5px dashed var(--zy-primary)" : "1px solid var(--zy-border)",
            background: "rgba(var(--zy-primary-rgb),0.055)",
            color: "var(--zy-text-soft)",
            outline: "none",
          }}
        >
          <PlusIcon className="h-[66px] w-[66px] transition-all duration-300 group-hover:h-[30px] group-hover:w-[30px]" />
          <span className="mt-0 max-h-0 overflow-hidden text-[13px] font-medium tracking-[0.02em] opacity-0 transition-all duration-300 group-hover:mt-2 group-hover:max-h-6 group-hover:opacity-100">
            {actionLabel}
          </span>
        </button>

        <button
          type="button"
          aria-label="查看导入"
          data-el="view-imports"
          onClick={onOpenImports}
          className="group flex min-h-[96px] flex-col items-center justify-center gap-0 rounded-[14px] transition-all active:scale-[0.97]"
          style={{
            border: "1px solid var(--zy-border)",
            background: "rgba(var(--zy-primary-rgb),0.055)",
            color: "var(--zy-text-soft)",
          }}
        >
          <SearchIcon className="h-[58px] w-[58px] transition-all duration-300 group-hover:h-[30px] group-hover:w-[30px]" />
          <span className="mt-0 max-h-0 overflow-hidden text-[13px] font-medium tracking-[0.02em] opacity-0 transition-all duration-300 group-hover:mt-2 group-hover:max-h-6 group-hover:opacity-100">
            查看导入
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept={isCreator ? "audio/*,video/*" : "image/*,.txt,text/plain"}
          onChange={onFile}
          style={{ display: "none" }}
        />
      </div>

      {hasResult && (
        <div data-el="import-result" className="mb-[18px] flex flex-col gap-[10px]">
          {parsing && (
            <p className="m-0 text-[12px]" style={{ color: "var(--zy-text-muted)" }}>
              正在识别歌单…（约 10–20 秒）
            </p>
          )}

          {error && (
            <p className="m-0 text-[12px]" style={{ color: "#f27d7d" }}>
              {error}
            </p>
          )}

          {!isCreator && songs.length > 0 && !batchResult && (
            <p className="m-0 text-[12px]" style={{ color: "var(--zy-text-soft)" }}>
              已识别 {songs.length} 首，正在后台生成解析…
            </p>
          )}

          {!isCreator && batchResult && (
            <>
              <p className="m-0 text-[12px]" style={{ color: "var(--zy-text)" }}>
                已生成 {batchResult.ok}/{batchResult.total} 首
                {batchResult.total - batchResult.ok > 0
                  ? `（失败 ${batchResult.total - batchResult.ok} 首）`
                  : ""}
              </p>
              {batchResult.errors.length > 0 && (
                <p className="m-0 text-[11px]" style={{ color: "#f27d7d" }}>
                  失败原因：{batchResult.errors.slice(0, 3).join("；")}
                  {batchResult.errors.length > 3 ? " 等" : ""}
                </p>
              )}
            </>
          )}

          {analyzing && (
            <p className="m-0 text-[12px]" style={{ color: "var(--zy-primary)" }}>
              AI 正在听音频并生成解析…（约 1-2 分钟）
            </p>
          )}

          {creatorResult && (
            <div className="flex flex-col gap-[6px]">
              <p className="m-0 text-[12px]" style={{ color: "var(--zy-text)" }}>
                ✅ 解析完成：{creatorResult.count} 个注脚点
              </p>
              {creatorResult.summary && (
                <p className="m-0 text-[12px] leading-[1.6]" style={{ color: "var(--zy-text-muted)" }}>
                  {creatorResult.summary}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
