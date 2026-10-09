"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnalysisPopover } from "@/components/zhiyin/analysis-popover";
import { useLiveScript } from "@/lib/zhiyin/use-live-script";
import { ImportsView } from "@/components/zhiyin/imports-view";
import { ImportFlow } from "@/components/zhiyin/import-flow";
import { Waveform } from "@/components/zhiyin/waveform";
import {
  DIMENSION_ICONS,
  DIMENSION_HANZI,
  HanziIcon,
  HeadphoneIcon,
  PaletteIcon,
  type DimensionKey,
} from "@/components/zhiyin/dimension-icons";

/**
 * 知音 · 首屏面板（1:1 还原原始设计稿「湖蓝舞台」）。
 * 身份切换 / 导入歌单 / 批量预生成 / 曲目库 / 主题配色均已对接真实 window.api。
 */

const MODES: { key: DimensionKey; label: string; active?: boolean }[] = [
  { key: "sing", label: "唱", active: true },
  { key: "lyrics", label: "词" },
  { key: "compose", label: "曲" },
  { key: "arrange", label: "编" },
];

/** 维度按钮显示风格："hanzi" 汉字版 | "icon" 意象图标版 */
const DIMENSION_STYLE: "hanzi" | "icon" = "icon";

/** 预设配色（仅视觉切换，不改任何布局/文案/结构） */
const PALETTES: {
  name: string;
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  border: string;
  surface: string;
}[] = [
  {
    name: "霓虹粉",
    bg: "#20101C",
    primary: "#F04E9A",
    secondary: "#F97CC0",
    accent: "#FFCDE6",
    border: "rgba(249, 124, 192, 0.20)",
    surface: "rgba(46, 21, 37, 0.62)",
  },
  {
    name: "幻影紫",
    bg: "#14101F",
    primary: "#8B5CF6",
    secondary: "#A78BFA",
    accent: "#D6C6FF",
    border: "rgba(167, 139, 250, 0.18)",
    surface: "rgba(30, 23, 46, 0.62)",
  },
  {
    name: "蓝绿",
    bg: "#07191B",
    primary: "#22C7D6",
    secondary: "#3FE0C8",
    accent: "#A9F2E8",
    border: "rgba(63, 224, 200, 0.20)",
    surface: "rgba(12, 33, 35, 0.62)",
  },
  {
    name: "暗夜红",
    bg: "#1E0D14",
    primary: "#E11D48",
    secondary: "#FB7185",
    accent: "#FFB3C1",
    border: "rgba(251, 113, 133, 0.18)",
    surface: "rgba(40, 17, 25, 0.62)",
  },
  {
    name: "香槟黄",
    bg: "#1C1608",
    primary: "#F5B70A",
    secondary: "#FFD31A",
    accent: "#FFE45C",
    border: "rgba(255, 211, 26, 0.22)",
    surface: "rgba(38, 30, 12, 0.62)",
  },
  {
    name: "极简银",
    bg: "#0C0E12",
    primary: "#E6EAF1",
    secondary: "#9AA3B2",
    accent: "#C8D0DC",
    border: "rgba(210, 218, 228, 0.20)",
    surface: "rgba(20, 23, 29, 0.72)",
  },
];

/** hex(#rrggbb) → "r, g, b" 分量字符串 */
function hexToRgb(hex: string): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function applyPalette(p: (typeof PALETTES)[number], broadcast = true) {
  const root = document.documentElement.style;
  root.setProperty("--zy-bg", p.bg);
  root.setProperty("--zy-primary", p.primary);
  root.setProperty("--zy-secondary", p.secondary);
  root.setProperty("--zy-accent", p.accent);
  root.setProperty("--zy-border", p.border);
  root.setProperty("--zy-surface", p.surface);
  root.setProperty(
    "--zy-shadow-glow",
    `0 0 30px ${p.secondary}70, 0 0 60px ${p.primary}45`,
  );
  // 同步 RGB 分量，让悬浮球、光晕等所有用主题色的地方一起变
  root.setProperty("--zy-primary-rgb", hexToRgb(p.primary));
  root.setProperty("--zy-secondary-rgb", hexToRgb(p.secondary));
  root.setProperty("--zy-accent-rgb", hexToRgb(p.accent));
  root.setProperty("--zy-bg-rgb", hexToRgb(p.bg));
  // 同步主题色到悬浮球窗口（悬浮球侧应用时 broadcast=false，避免死循环）
  if (broadcast) (window as any).api?.setTheme?.(p);
}

/** 调色按钮：放在导览卡文字块右侧，展开色板，选择即全局换色 */
function ColorSwitcher() {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  return (
    <div
      className="absolute right-0 top-2.5 z-20 h-9 w-9"
      data-el="color-switcher"
    >
      <button
        type="button"
        aria-label="切换配色"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-[12px] transition-all active:scale-90"
        style={{
          border: "1px solid transparent",
          background: "rgba(255,255,255,0.045)",
          color: "var(--zy-text-soft)",
        }}
      >
        <PaletteIcon size={20} />
      </button>

      {open && (
        <div
          className="absolute right-full top-3 mr-4 flex w-max flex-col gap-2.5 rounded-[16px] p-3"
          data-el="color-swatch-list"
          style={{
            background: "rgba(var(--zy-bg-rgb), 0.72)",
            backdropFilter: "blur(16px) saturate(1.3)",
            WebkitBackdropFilter: "blur(16px) saturate(1.3)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "0 14px 36px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {[PALETTES.slice(0, 3), PALETTES.slice(3, 6)].map((row, r) => (
            <div key={r} className="flex gap-2.5">
              {row.map((p, c) => {
                const i = r * 3 + c;
                return (
                  <button
                    key={p.name}
                    type="button"
                    aria-label={p.name}
                    title={p.name}
                    onClick={() => {
                      applyPalette(p);
                      setActiveIdx(i);
                      setOpen(false);
                    }}
                    className="h-7 w-7 shrink-0 rounded-full transition-transform hover:scale-110 active:scale-90"
                    style={{
                      background: p.primary,
                      border:
                        activeIdx === i
                          ? "2px solid var(--zy-text)"
                          : "2px solid transparent",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 身份切换：默认【听众】(耳机)，点击切【创作者】(羽毛笔)；hover 显示一行小字 */
function RoleSwitcher({
  isCreator,
  onToggle,
}: {
  isCreator: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="group relative mt-[10px] flex flex-col items-start gap-2" data-el="role-switcher">
      {/* 分段滑动开关：听众 | 创作者，选中项滑动高亮 */}
      <div
        className="relative flex items-center rounded-[16px] p-[4px]"
        style={{
          border: "1px solid var(--zy-border)",
          background: "rgba(var(--zy-primary-rgb),0.055)",
        }}
      >
        {/* 滑动高亮块 */}
        <span
          aria-hidden
          className="absolute top-[4px] bottom-[4px] w-[calc(50%-4px)] rounded-[12px]"
          style={{
            left: isCreator ? "calc(50%)" : "4px",
            background:
              "linear-gradient(135deg, rgba(var(--zy-primary-rgb),0.55), rgba(var(--zy-secondary-rgb),0.4))",
            boxShadow: "0 0 16px rgba(var(--zy-primary-rgb),0.28)",
            transition: "left 0.34s cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        {/* 听众 */}
        <button
          type="button"
          aria-label="听众"
          aria-pressed={!isCreator}
          onClick={() => { if (isCreator) onToggle(); }}
          className="relative z-10 flex items-center gap-2 rounded-[12px] px-3.5 py-2 transition-colors active:scale-[0.96]"
          style={{ color: !isCreator ? "#fff" : "var(--zy-text-muted)" }}
        >
          <HeadphoneIcon size={22} active={!isCreator} />
          <span className="text-[15px] font-semibold tracking-[0.04em]">听众</span>
        </button>
        {/* 创作者 */}
        <button
          type="button"
          aria-label="创作者"
          aria-pressed={isCreator}
          onClick={() => { if (!isCreator) onToggle(); }}
          className="relative z-10 flex items-center gap-2 rounded-[12px] px-3.5 py-2 transition-colors active:scale-[0.96]"
          style={{ color: isCreator ? "#fff" : "var(--zy-text-muted)" }}
        >
          <span
            aria-hidden
            className="inline-block h-[22px] w-[22px]"
            style={{
              backgroundColor: isCreator ? "#fff" : "var(--zy-text-muted)",
              WebkitMaskImage: "url(./treble-clef2.png?v=2)",
              maskImage: "url(./treble-clef2.png?v=2)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />
          <span className="text-[15px] font-semibold tracking-[0.04em]">创作者</span>
        </button>
      </div>
      {/* 角色注脚小字 */}
      <p
        className="pl-1 text-[11.5px] leading-[1.5] tracking-[0.01em]"
        style={{ color: "var(--zy-text-muted)" }}
      >
        {isCreator
          ? "每一位创作者都是狂热的听众"
          : "每一位听众都是潜在的创作者"}
      </p>
    </div>
  );
}

export function GuidePanel() {
  const [isCreator, setIsCreator] = useState(false);
  // 页面视图：panel = 主面板；imports = 查看导入第二页
  const [view, setView] = useState<"panel" | "imports">("panel");
  // 维度选中：-1 = 都未选中（大家一样），点击某个才选中变色
  const [activeDim, setActiveDim] = useState(-1);
  return (
    <aside
      data-el="guide-panel"
      aria-label="音乐导览面板"
      className="zy-glass relative flex w-full flex-col rounded-[24px] p-5"
      style={{ minHeight: 478 }}
    >
      {view === "imports" ? (
        <ImportsView
          role={isCreator ? "creator" : "listener"}
          onBack={() => setView("panel")}
        />
      ) : (
      <div className="relative z-10">
      <div className="mb-[18px] flex items-start justify-between">
        <RoleSwitcher
          isCreator={isCreator}
          onToggle={() => setIsCreator((v) => !v)}
        />
      </div>

      <ImportFlow
        key={isCreator ? "creator" : "listener"}
        role={isCreator ? "creator" : "listener"}
        onOpenImports={() => setView("imports")}
      />

      <div
        className="relative border-t pt-[6px] pb-[18px]"
        style={{ borderColor: "var(--zy-border)" }}
      >
        <ColorSwitcher />
        <span
          className="font-mono text-[10px] tracking-[0.13em]"
          style={{ color: "var(--zy-primary)" }}
        >
          WAVEFORM
        </span>
        <Waveform />
      </div>

      <div
        data-el="dimension-bar"
        className="grid grid-cols-4 gap-[7px] border-t pt-[18px]"
        style={{ borderColor: "var(--zy-border)" }}
      >
        {MODES.map((m, i) => {
          const Icon = DIMENSION_ICONS[m.key];
          const selected = activeDim === i;
          return (
            <button
              key={m.key}
              type="button"
              aria-label={m.label}
              aria-pressed={selected}
              data-el={"dimension-" + m.key}
              onClick={() => setActiveDim(selected ? -1 : i)}
              className="group flex min-h-[52px] flex-col items-center justify-center gap-0 rounded-[14px] transition-all duration-300 active:scale-[0.93]"
              style={{
                transform: selected ? "scale(1.08)" : "scale(1)",
                border: selected
                  ? "1.5px solid rgba(var(--zy-primary-rgb),0.85)"
                  : "1px solid var(--zy-border)",
                background: selected
                  ? "linear-gradient(135deg, rgba(var(--zy-primary-rgb),0.55), rgba(var(--zy-secondary-rgb),0.45) 48%, rgba(0,0,0,0.35))"
                  : "rgba(var(--zy-primary-rgb),0.055)",
                color: selected ? "#ffffff" : "var(--zy-text-soft)",
                textShadow: selected ? "0 1px 3px rgba(0,0,0,0.55)" : "none",
                opacity: selected ? 1 : 0.7,
                boxShadow: selected
                  ? "0 0 26px rgba(var(--zy-primary-rgb),0.34), inset 0 0 12px rgba(var(--zy-primary-rgb),0.12)"
                  : "none",
              }}
            >
              {DIMENSION_STYLE === "hanzi" ? (
                <HanziIcon char={DIMENSION_HANZI[m.key]} size={24} active={selected} />
              ) : (
                <Icon size={24} active={selected} />
              )}
              {/* 选中项汉字常驻显示；未选中项 hover 才展开 */}
              <span
                aria-hidden
                className={
                  "overflow-hidden text-[12px] font-semibold leading-none tracking-[0.1em] transition-all duration-300 " +
                  (selected
                    ? "mt-[5px] max-h-[16px] opacity-100"
                    : "mt-0 max-h-0 opacity-0 group-hover:mt-[5px] group-hover:max-h-[16px] group-hover:opacity-100")
                }
              >
                {DIMENSION_HANZI[m.key]}
              </span>
            </button>
          );
        })}
      </div>
      </div>
      )}
    </aside>
  );
}

const ORB_SIZE = 62;

export function FloatingOrb({ live = false, fullscreen = false }: { live?: boolean; fullscreen?: boolean }) {
  const liveData = useLiveScript();
  // 位置：left/top（px）。null 表示尚未初始化，用默认右下角
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    moved: boolean;
    offsetX: number;
    offsetY: number;
    lastScreenX: number;
    lastScreenY: number;
  }>({ dragging: false, moved: false, offsetX: 0, offsetY: 0, lastScreenX: 0, lastScreenY: 0 });
  const [open, setOpen] = useState(false);
  const [relX, setRelX] = useState(0.5);
  const [pressed, setPressed] = useState(false);
  const [paused, setPaused] = useState(false);
  const userClosedRef = useRef(false);

  // live：有注脚/简介、且用户未手动收起时，自动弹框（按 positionSec 常驻，非全屏也弹）
  useEffect(() => {
    if (!live) return;
    if (paused) {
      // 暂停注脚：收起卡片
      setOpen(false);
      return;
    }
    if (!userClosedRef.current && (liveData.active || liveData.script)) {
      setOpen(true);
    }
  }, [live, paused, liveData.active, liveData.script]);

  // live：驱动悬浮球窗口尺寸（idle=仅球 / card=固定大窗）。气泡打开或收到剧本时用大窗，避免弹框被裁掉
  useEffect(() => {
    if (!live) return;
    const api = (window as any).api;
    if (!api?.resizeBall) return;
    api.resizeBall(!open && !liveData.active && !liveData.script ? "idle" : "card", 800);
  }, [live, open, liveData.active, liveData.script]);

  // 初始化：球定位到「框框（导览面板）」下方 —— 右端与面板右端对齐、位于面板底边下方
  useEffect(() => {
    if (live) return;
    const place = () => {
      // 默认位置：视口左右居中、上下靠下
      setPos({
        x: Math.round(window.innerWidth / 2 - ORB_SIZE / 2),
        y: Math.round(window.innerHeight - ORB_SIZE - Math.max(28, window.innerHeight * 0.06)),
      });
    };
    place();
    const raf = requestAnimationFrame(place); // 下一帧再校准一次，确保面板已完成布局
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
    };
  }, [live]);

  // live：连续跟踪球在屏幕上的相对位置（0~1），供气泡平滑跟随
  useEffect(() => {
    if (!live) return;
    const update = () => {
      const sx = window.screenX || 0;
      const sw = window.screen?.availWidth || 1920;
      const cx = sx + window.innerWidth / 2;
      setRelX(Math.max(0, Math.min(1, cx / sw)));
    };
    update();
    const iv = setInterval(update, 80);
    return () => clearInterval(iv);
  }, [live]);

  // live：订阅「暂停注脚」状态（右键菜单切换），暂停时把球压暗以示关闭
  useEffect(() => {
    if (!live) return;
    const api = (window as any).api;
    if (!api?.onBallState) return;
    const off = api.onBallState((s: any) => {
      if (s && typeof s.paused === "boolean") setPaused(s.paused);
    });
    return () => off && off();
  }, [live]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current.dragging = true;
    dragRef.current.moved = false;
    setPressed(true);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current.offsetX = e.clientX - rect.left;
    dragRef.current.offsetY = e.clientY - rect.top;
    dragRef.current.lastScreenX = e.screenX;
    dragRef.current.lastScreenY = e.screenY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    if (live) {
      const dx = e.screenX - d.lastScreenX;
      const dy = e.screenY - d.lastScreenY;
      d.lastScreenX = e.screenX;
      d.lastScreenY = e.screenY;
      if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
      if (d.moved && (window as any).api?.moveBall) (window as any).api.moveBall(dx, dy);
      return;
    }
    const nx = e.clientX - d.offsetX;
    const ny = e.clientY - d.offsetY;
    d.moved = true;
    setPos({
      x: Math.min(Math.max(8, nx), window.innerWidth - ORB_SIZE - 8),
      y: Math.min(Math.max(8, ny), window.innerHeight - ORB_SIZE - 8),
    });
  }, [live]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      d.dragging = false;
      setPressed(false);
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      if (!d.moved) {
        // 未移动视为点击：切换解析弹框
        setOpen((v) => {
          userClosedRef.current = v; // 关闭时标记手动收起，打开时清除
          return !v;
        });
      }
    },
    [],
  );

  // 右键悬浮球：弹出原生菜单（暂停注脚 / 屏蔽当前曲 / 退出）
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    (window as any).api?.showBallMenu?.();
  }, []);

  return (
    <div
      className="z-30 h-[64px] w-[64px] touch-none select-none"
      style={
        live
          ? { position: "absolute", left: "calc(50% - 32px)", bottom: 4 }
          : pos
            ? { position: "fixed", left: pos.x, top: pos.y }
            : { position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "max(28px, 4vw)" }
      }
    >
      {/* 外扩氛围光晕：live 模式（悬浮球窗口）去掉这层雾，避免球体外围发灰 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-3 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(var(--zy-primary-rgb), 0.30) 0%, rgba(var(--zy-secondary-rgb), 0.16) 40%, transparent 70%)",
          filter: "blur(8px)",
          opacity: live ? 0 : open ? 1 : 0,
          transition: "opacity 0.3s ease",
          animation: live ? "none" : open ? "zy-orb-breathe 4s ease-in-out infinite" : "none",
        }}
      />
      {/* 抛光金属球：实体金属渐变 + 锐利镜面高光 + 底部环境反射 + 球面音符刻痕 */}
      <div
        className="transition-transform duration-150 ease-out"
        style={{ transform: pressed ? "scale(0.88)" : "scale(1)" }}
      >
      <button
        type="button"
        aria-label="打开导览（可拖动，右键菜单）"
        data-el="floating-orb"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={live ? onContextMenu : undefined}
        className="group relative h-[64px] w-[64px] cursor-grab touch-none overflow-hidden rounded-full active:cursor-grabbing"
        style={{
          // 玻璃球：圆形，白色调 + 主题色渐变（上一版质感）
          background:
            "radial-gradient(120% 120% at 38% 26%, rgba(255,255,255,0.92) 0%, rgba(var(--zy-accent-rgb),0.9) 38%, rgba(var(--zy-secondary-rgb),0.86) 72%, rgba(var(--zy-primary-rgb),0.55) 100%), rgba(var(--zy-secondary-rgb),0.8)",
          animation: "zy-orb-breathe 4s ease-in-out infinite",
          // 暂停注脚时压暗去饱和，提示已关闭
          opacity: paused ? 0.45 : 1,
          filter: paused ? "grayscale(0.65)" : "none",
          transition: "opacity 0.25s ease, filter 0.25s ease",
        }}
      >
        {/* 顶部镜面高光带：Liquid Glass 的明亮反光 */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[5px] h-[15px] w-[38px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0.18) 52%, transparent 82%)",
            transform: "translateX(-50%) rotate(-8deg)",
            filter: "blur(3px)",
          }}
        />
        {/* 边缘折射高光环已按需求移除，不再显示明显边框 */}
        {/* 底部折射亮弧：玻璃下缘聚光 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side at 50% 118%, rgba(255,255,255,0.34), rgba(var(--zy-accent-rgb),0.16) 42%, transparent 62%)",
          }}
        />
      </button>
      </div>
      {/* 点球弹出的独立解析弹框：按球在屏幕的水平位置决定对齐，避免溢出 */}
      <AnalysisPopover
        open={open}
        onClose={() => {
          setOpen(false);
          userClosedRef.current = true;
        }}
        align={
          live
            ? "center"
            : (() => {
                if (typeof window === "undefined") return "center";
                const cx = pos ? pos.x + ORB_SIZE / 2 : window.innerWidth / 2;
                if (cx < window.innerWidth * 0.28) return "left";
                if (cx > window.innerWidth * 0.72) return "right";
                return "center";
              })()
        }
        highlight={live ? liveData.active : undefined}
        summary={live ? liveData.script?.summary : undefined}
        clockSec={live ? liveData.clockSec : undefined}
        alignPct={live ? relX : undefined}
        fullscreen={fullscreen}
      />
    </div>
  );
}
