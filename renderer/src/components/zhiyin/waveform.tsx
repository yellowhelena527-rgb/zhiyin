"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 音频可视化：两条规则、宽而流畅的横向波（正弦波）。
 * 每时刻整体振幅由「响度 × 配器丰富度」驱动 —— 越响、乐器越多，波越大。
 * 捕获失败时退回时变波。
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

type ZhiyinApi = {
  onSource?: (cb: (s: Source) => void) => () => void;
};

const W = 280;
const H = 76;
const N = 80; // 每条波的采样点

type Band = {
  y: number;
  amp: number;
  k: number;
  w: number;
  opacity: number;
};

const BANDS: Band[] = [
  { y: 54, amp: 20, k: 0.08, w: 1.4, opacity: 0.85 }, // 低频（深）
  { y: 24, amp: 13, k: 0.12, w: 3.4, opacity: 0.5 }, // 高频（浅）
];

function f(n: number): string {
  return n.toFixed(2);
}

/** 响度 + 配器丰富度（活跃频段占比） */
function analyze(data: Uint8Array<ArrayBuffer> | null): { loudness: number; richness: number } {
  if (!data || !data.length) return { loudness: 0.5, richness: 0.4 };
  let sum = 0;
  let active = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] > 40) active++;
  }
  return {
    loudness: sum / (data.length * 255),
    richness: active / data.length,
  };
}

/** 整体能量：响度 × (0.4 + 0.6 × 配器丰富度) */
function overallEnergy(data: Uint8Array<ArrayBuffer> | null): number {
  const { loudness, richness } = analyze(data);
  return loudness * (0.4 + 0.6 * richness);
}

/** 单条自由波：非整数倍谐波叠加，非轴对称，振幅随能量变化 */
function buildLine(band: Band, data: Uint8Array<ArrayBuffer> | null, t: number): string {
  const energy = data
    ? overallEnergy(data)
    : 0.5 + 0.4 * Math.sin(t * 1.2 + band.y * 0.15);
  const amp = band.amp * (0.35 + 0.65 * energy);
  let d = "";
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * W;
    const y = band.y + amp * Math.sin(x * band.k - band.w * t);
    d += `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`;
  }
  return d;
}

const STATIC_LINES = BANDS.map((b) => buildLine(b, null, 0));

function getApi(): ZhiyinApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { api?: ZhiyinApi }).api;
}

export function Waveform() {
  const lineRefs = useRef<(SVGPathElement | null)[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 捕获系统音频输出（仅音频 loopback，不抓屏）
  useEffect(() => {
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    async function setup() {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: false, audio: true });
        ctx = new AudioContext();
        await ctx.resume();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        src.connect(analyser);
        analyserRef.current = analyser;
        freqRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        analyserRef.current = null;
        freqRef.current = null;
      }
    }
    setup();
    return () => {
      stream?.getTracks().forEach((tr) => tr.stop());
      ctx?.close();
      analyserRef.current = null;
      freqRef.current = null;
    };
  }, []);

  // 订阅播放状态
  useEffect(() => {
    const api = getApi();
    if (!api?.onSource) return;
    const off = api.onSource((s) => setIsPlaying(!!(s && s.isPlaying)));
    return () => off && off();
  }, []);

  // 播放时每帧读频谱、重建所有波；不播放时静止
  useEffect(() => {
    if (!isPlaying) {
      BANDS.forEach((_, i) => {
        if (lineRefs.current[i]) lineRefs.current[i].setAttribute("d", STATIC_LINES[i]);
      });
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const analyser = analyserRef.current;
      const data = freqRef.current;
      if (analyser && data) analyser.getByteFrequencyData(data);
      BANDS.forEach((band, i) => {
        lineRefs.current[i]?.setAttribute("d", buildLine(band, data, t));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-[10px] h-[84px] w-full"
      aria-label="音频波形"
    >
      {BANDS.map((band, i) => (
        <path
          key={i}
          ref={(el) => {
            lineRefs.current[i] = el;
          }}
          d={STATIC_LINES[i]}
          stroke={`rgba(var(--zy-primary-rgb), ${band.opacity})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </svg>
  );
}
