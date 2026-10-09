"use client";

import { useEffect, useState } from "react";
import {
  loadCachedSongs,
  getCachedScript,
  type CachedSongs,
  type Song,
  type Script,
  type SongRole,
} from "@/lib/zhiyin/song-library";
import { fmtTimecode } from "@/components/zhiyin/analysis-popover";

/**
 * 「查看导入」第二页：分步入场交互。
 * stage 0 → 只显示「X你好」
 * stage 1 → 加显「请查看您上传过的歌曲」
 * stage 2 → 大玻璃框出现 + 曲目逐个弹出
 */
export function ImportsView({
  role,
  onBack,
}: {
  role: SongRole;
  onBack: () => void;
}) {
  const [songs, setSongs] = useState<CachedSongs | null>(null);
  const [stage, setStage] = useState(0);
  const [detail, setDetail] = useState<{ song: Song; script: Script | null; loading: boolean } | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCachedSongs().then((s) => {
      if (alive) setSongs(s);
    });
    const t1 = setTimeout(() => alive && setStage(1), 600);
    const t2 = setTimeout(() => alive && setStage(2), 1250);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const roleName = role === "creator" ? "创作者" : "听众";
  const list = songs ? songs[role] : null;

  function openDetail(song: Song) {
    setDetail({ song, script: null, loading: true });
    getCachedScript(song.title).then((s) => {
      setDetail((d) => (d && d.song.title === song.title && d.song.artist === song.artist ? { song, script: s, loading: false } : d));
    });
  }

  async function doClear() {
    if (!window.confirm("确定清空全部缓存（所有已生成的解析）吗？")) return;
    setClearing(true);
    try {
      await (window as any).api?.clearCache?.();
      const s = await loadCachedSongs();
      setSongs(s);
      setDetail(null);
    } finally {
      setClearing(false);
    }
  }

  const rise = (show: boolean, delay = 0) => ({
    opacity: show ? 1 : 0,
    transform: show ? "translateY(0)" : "translateY(12px)",
    transition: `opacity 0.5s ease ${delay}s, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
  });

  return (
    <div className="relative z-10 flex w-full flex-1 flex-col">
      {/* 顶部：返回 + 清空缓存 */}
      <div className="mb-[18px] flex items-start justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 border-0 bg-transparent text-[13px] font-medium tracking-[0.02em] transition-opacity hover:opacity-70"
          style={{ color: "var(--zy-text-soft)" }}
          aria-label="返回"
        >
          <span className="text-[16px] leading-none">‹</span> 返回
        </button>
        <button
          type="button"
          onClick={doClear}
          disabled={clearing}
          className="rounded-[8px] px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{
            background: "rgba(var(--zy-primary-rgb),0.10)",
            border: "1px solid var(--zy-border)",
            color: "var(--zy-text-muted)",
            cursor: clearing ? "not-allowed" : "pointer",
            opacity: clearing ? 0.6 : 1,
          }}
        >
          {clearing ? "清空中…" : "清空缓存"}
        </button>
      </div>

      {/* 第一步：问候 */}
      <h2
        className="mb-1 font-heading text-[22px] font-semibold leading-[1.2] tracking-[-0.01em]"
        style={{ color: "var(--zy-text)", ...rise(stage >= 0) }}
      >
        {roleName}你好
      </h2>

      {/* 第二步：引导语 */}
      <p
        className="mb-4 text-[13px] leading-[1.5]"
        style={{ color: "var(--zy-text-soft)", ...rise(stage >= 1) }}
      >
        请查看您上传过的歌曲
      </p>

      {/* 第三步：大玻璃框 + 曲目逐个弹出 */}
      <div
        data-el="song-library-box"
        className="flex-1 rounded-[18px] p-3"
        style={{
          border: "1px solid var(--zy-border)",
          background: "rgba(var(--zy-primary-rgb),0.05)",
          minHeight: 220,
          ...rise(stage >= 2),
        }}
      >
        {detail ? (
          <div className="flex max-h-[300px] flex-col gap-3 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="flex items-center gap-1 self-start border-0 bg-transparent text-[12px]"
              style={{ color: "var(--zy-text-soft)", cursor: "pointer" }}
            >
              <span className="text-[16px] leading-none">‹</span> 返回列表
            </button>

            <div>
              <div className="text-[15px] font-semibold" style={{ color: "var(--zy-text)" }}>
                {detail.song.title}
              </div>
              {detail.song.artist ? (
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--zy-text-muted)" }}>
                  {detail.song.artist}
                </div>
              ) : null}
            </div>

            {detail.loading ? (
              <p className="m-0 text-[12px]" style={{ color: "var(--zy-text-muted)" }}>
                正在读取解析…
              </p>
            ) : !detail.script ? (
              <p className="m-0 text-[12px]" style={{ color: "var(--zy-text-muted)" }}>
                该曲暂未生成解析，请先导入歌单并「开始批量预生成」。
              </p>
            ) : (
              <>
                {detail.script.summary ? (
                  <p className="m-0 text-[13px] leading-[1.6]" style={{ color: "var(--zy-text-soft)" }}>
                    {detail.script.summary}
                  </p>
                ) : null}
                {(detail.script.highlights || []).map((h, i) => (
                  <div
                    key={i}
                    className="rounded-[12px] p-3"
                    style={{
                      background: "rgba(var(--zy-primary-rgb),0.06)",
                      border: "1px solid var(--zy-border)",
                    }}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[11px]" style={{ color: "var(--zy-primary)" }}>
                        {fmtTimecode(h.time)}
                      </span>
                      <span className="text-[13px] font-semibold leading-[1.5]" style={{ color: "var(--zy-text)" }}>
                        {h.core}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1">
                      {([
                        ["唱", h.唱],
                        ["词", h.词],
                        ["曲", h.曲],
                        ["编", h.编],
                      ] as const).map(([k, v]) => (
                        <p key={k} className="m-0 text-[12px] leading-[1.6]" style={{ color: "var(--zy-text-soft)" }}>
                          <span className="mr-1 font-semibold" style={{ color: "var(--zy-text)" }}>{k} ·</span>
                          {v}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : list === null ? (
          <div
            className="flex h-full min-h-[196px] items-center justify-center text-[13px]"
            style={{ color: "var(--zy-text-muted)" }}
          >
            正在读取曲目…
          </div>
        ) : list.length === 0 ? (
          <div
            className="flex h-full min-h-[196px] flex-col items-center justify-center gap-1 text-center text-[13px]"
            style={{ color: "var(--zy-text-muted)" }}
          >
            <span className="text-[15px]" style={{ color: "var(--zy-text-soft)" }}>
              还没有曲目
            </span>
            <span>以{roleName}身份上传后，会显示在这里</span>
          </div>
        ) : (
          <ul className="flex max-h-[300px] flex-col gap-[6px] overflow-y-auto pr-1">
            {list.map((song, i) => (
              <li
                key={`${song.title}-${i}`}
                onClick={() => openDetail(song)}
                className="flex items-center gap-3 rounded-[12px] px-3 py-[10px] transition-colors"
                style={{
                  background: "rgba(var(--zy-primary-rgb),0.06)",
                  cursor: "pointer",
                  // 玻璃框出现后，每首歌再逐个错开弹出
                  ...rise(stage >= 2, 0.15 + i * 0.1),
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(var(--zy-primary-rgb),0.14)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(var(--zy-primary-rgb),0.06)")}
              >
                <span
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full font-mono text-[11px]"
                  style={{
                    background: "rgba(var(--zy-primary-rgb),0.14)",
                    color: "var(--zy-text-soft)",
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-[13.5px] font-medium tracking-[0.01em]"
                    style={{ color: "var(--zy-text)" }}
                    title={song.title}
                  >
                    {song.title}
                  </span>
                  {song.artist ? (
                    <span
                      className="truncate text-[11.5px] tracking-[0.01em]"
                      style={{ color: "var(--zy-text-muted)" }}
                      title={song.artist}
                    >
                      {song.artist}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-[16px]" style={{ color: "var(--zy-text-muted)" }}>
                  ›
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {list && list.length > 0 && (
        <p
          className="mt-3 text-center font-mono text-[10px] tracking-[0.12em]"
          style={{ color: "var(--zy-text-muted)", ...rise(stage >= 2, 0.35) }}
        >
          共 {list.length} 首 · 仅显示{roleName}身份上传的曲目
        </p>
      )}
    </div>
  );
}
