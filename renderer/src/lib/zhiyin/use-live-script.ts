"use client";

import { useEffect, useRef, useState } from "react";
import type { HighlightData } from "@/components/zhiyin/analysis-popover";

/**
 * 悬浮球实时数据源：订阅 Electron 注入的 window.api（onSource / onScript），
 * 按 positionSec 找出当前注脚点。无宿主（浏览器预览）时安全降级，不抛错。
 */

type Source = {
  channel: string;
  title: string;
  artist: string;
  isPlaying: boolean;
  positionSec: number;
  duration: number;
  at: number;
};

export type Script = {
  summary: string;
  highlights: HighlightData[];
  mode: "listener" | "creator";
  /** 后端已用真实歌词时间戳钉住注脚时间点，前端不再均匀重铺 */
  timed?: boolean;
  /** 无 API Key 时的演示占位注脚 */
  mock?: boolean;
};

type ZhiyinApi = {
  onSource?: (cb: (s: Source) => void) => () => void;
  onScript?: (cb: (d: { key: string; script: Script }) => void) => () => void;
  resizeBall?: (mode: "idle" | "card", height: number) => void;
  moveBall?: (dx: number, dy: number) => void;
  searchTerm?: (term: string) => void;
};

function getApi(): ZhiyinApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { api?: ZhiyinApi }).api;
}

const EMPTY_SOURCE: Source = {
  channel: "none",
  title: "",
  artist: "",
  isPlaying: false,
  positionSec: 0,
  duration: 0,
  at: 0,
};

function computeTime(s: Source, now: number) {
  if (!s) return 0;
  const pos = s.positionSec || 0;
  if (s.isPlaying) return pos + (now - (s.at || now)) / 1000;
  return pos;
}

/** 听众模式：忽略 AI 给的时间点，按顺序把注脚点均匀铺满整首时长 */
function redistribute(highlights: HighlightData[], duration: number): HighlightData[] {
  if (!highlights || highlights.length < 2 || !duration) return highlights;
  const n = highlights.length;
  return highlights.map((h, i) => ({ ...h, time: Math.round(((i + 0.5) / n) * duration) }));
}

function findActiveHighlight(highlights: HighlightData[], t: number): HighlightData | null {
  let active: HighlightData | null = null;
  for (let i = 0; i < highlights.length; i++) {
    if (t >= highlights[i].time) active = highlights[i];
    else break;
  }
  return active;
}

export function useLiveScript() {
  const [source, setSource] = useState<Source>(EMPTY_SOURCE);
  const [script, setScript] = useState<Script | null>(null);
  const [active, setActive] = useState<HighlightData | null>(null);
  const [clockSec, setClockSec] = useState(0);

  const sourceRef = useRef<Source>(EMPTY_SOURCE);
  const scriptRef = useRef<Script | null>(null);
  const lastHlTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const api = getApi();
    if (!api?.onSource) return;
    const off = api.onSource((s) => {
      const next = s || EMPTY_SOURCE;
      sourceRef.current = next;
      // 位置/时间戳每 250ms 变一次，但渲染只看标题/歌手/播放态，避免无谓重渲染
      setSource((prev) =>
        prev.title === next.title &&
        prev.artist === next.artist &&
        prev.channel === next.channel &&
        prev.isPlaying === next.isPlaying
          ? prev
          : next
      );
    });
    return () => off && off();
  }, []);

  useEffect(() => {
    const api = getApi();
    if (!api?.onScript) return;
    const off = api.onScript((d) => {
      const sc = d && d.script ? d.script : null;
      scriptRef.current = sc;
      setScript(sc);
    });
    return () => off && off();
  }, []);

  // 主循环：按时间找当前注脚
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = sourceRef.current;
      const sc = scriptRef.current;
      const ok = s && s.isPlaying && sc && sc.highlights && sc.highlights.length > 0 && s.channel !== "none";
      if (ok) {
        const hs = sc.mode === "creator" ? sc.highlights : sc.timed ? sc.highlights : redistribute(sc.highlights, s.duration || 240);
        const t = computeTime(s, Date.now());
        const hl = findActiveHighlight(hs, t);
        const id = hl ? hl.time : null;
        if (id !== lastHlTimeRef.current) {
          lastHlTimeRef.current = id;
          setActive(hl);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 每 500ms 刷新当前播放时间，供气泡时间戳跟歌曲同步
  useEffect(() => {
    const iv = setInterval(() => {
      const s = sourceRef.current;
      if (s && s.isPlaying) setClockSec(computeTime(s, Date.now()));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  return { source, script, active, clockSec };
}
