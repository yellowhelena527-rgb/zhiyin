"use client";

import { useEffect, useState } from "react";
import {
  DIMENSION_ICONS,
  DIMENSION_HANZI,
  type DimensionKey,
} from "@/components/zhiyin/dimension-icons";

/** 独立解析弹框：点悬浮球弹出。示例数据，玻璃风格与主面板一致。 */

const DIMS: DimensionKey[] = ["sing", "lyrics", "compose", "arrange"];

/** 示例解析数据（无真实数据时兜底） */
const ANALYSIS: Record<DimensionKey, string> = {
  sing: "几乎清唱，成员用气声唱出关键歌词，极具穿透力。",
  lyrics: "“即使时光流逝”一句点出时间维度，升华主题。",
  compose: "旋律收窄，围绕中心音旋转，形成静态的凝滞感。",
  arrange: "只保留单音钢琴和极轻的弦乐泛音，制造呼吸空隙。",
};

/** 真实注脚数据（来自 AI 剧本的单个 highlight，维度字段用中文 key） */
export type HighlightData = {
  time: number;
  core: string;
  唱: string;
  词: string;
  曲: string;
  编: string;
};

/** 格式化秒数为 mm:ss */
export function fmtTimecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 音乐术语词典（长的在前，避免短词误匹配） */
const MUSIC_TERMS = [
  '分解和弦', '三度叠置', '混响尾音', '颗粒感', '层次感', '空间感', '立体声', '五声音阶', '属七和弦',
  '前奏', '主歌', '副歌', '间奏', '桥段', '尾声', '主唱', '伴唱', '和声', '和弦', '编曲', '配器', '混音', '母带',
  '气声', '假声', '颤音', '滑音', '转音', '装饰音', '音色', '声场', '声相', '干声', '湿声', '泛音', '音阶', '调式',
  '大调', '小调', '转调', '升调', '降调', '扫弦', '拨弦', '指弹', '揉弦', '滑弦', '三度', '五度', '共鸣', '咬字',
  '混响', '延迟', '回声', '压缩', '均衡', '失真', '过载', '节拍', '律动', '鼓点', '鼓组', '底鼓', '军鼓', '踩镲', '镲片', '贝斯', '采样', '复调', '音域', '尾音', '合成器', '电子鼓', '电子军鼓', '电子钢琴', '合成器贝斯', '拍手声', '沙锤', '断音', '同音反复', '真声', '哭腔',
  '音程跨度', '音程', '转位', '模进', '对位', '终止式', '半音', '全音', '切分音', '三连音', '附点', '弱起', '离调', '挂留音', '经过音', '增和弦', '减和弦',
  '三和弦', '七和弦', '九和弦', '挂四和弦', '增三和弦', '减七和弦', '半减七和弦', '属和弦', '下属和弦', '主和弦', '借用和弦', '调式互换', '拿波里和弦', '持续音', '踏板音', '功能进行',
  '纯四度', '纯五度', '增四度', '减五度', '大六度', '小七度', '大七度', '小二度', '大二度', '十二平均律', '半音阶', '全音阶', '多利亚', '弗里几亚', '利底亚', '混合利底亚', '洛克里亚',
  '拍号', '复合节拍', '复拍子', '五连音', '织体', '声部', '对位法', '卡农', '赋格', '动机', '主题', '变奏',
  '侧链压缩', '侧链', '门限', '限制器', '干湿比', '发送', '返送', '总线', '响度', '立体声成像', '中置', '谐波', '饱和', '磁带饱和', '前级', '话放', '自动调音', '音准修正', '频谱', '削波',
  '动态对比', '动态范围', '压缩比', '攻击时间', '释放时间', '阈值', '增益', '均衡器', '高通滤波', '低通滤波', '去齿音', '齿音', '动态处理', '立体声宽度', '相位', '混响时间', '预延迟', '声像定位', '声像', '滤波',
  '胸声', '头声', '混声', '咽音', '强混', '弱混', '共鸣腔', '胸腔共鸣', '头腔共鸣', '面罩共鸣', '鼻腔共鸣', '口腔共鸣', '咽腔共鸣', '气息',
  'reverb', 'delay', 'echo', 'compressor', 'distortion', 'arpeggio', 'vibrato', 'tremolo', 'sustain', 'pluck', 'strum', 'riff', 'bassline', 'breakdown', 'fade', 'pan', 'EQ',
  'limiter', 'sidechain', 'saturation', 'harmonics', 'sub-bass', 'glide', 'portamento', 'legato', 'staccato', 'formant', 'transient', 'Auto-Tune',
].sort((a, b) => b.length - a.length);

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const TERM_RE = new RegExp('(' + MUSIC_TERMS.map(escapeReg).join('|') + ')', 'gi');

/** 把文本里的音乐术语渲染成可点击搜索的词；搜索过的词不再高亮，但仍可点击 */
function renderTerms(
  text: string,
  searched: Set<string> | null,
  onSearch: (term: string) => void,
) {
  if (!text) return text;
  const clean = String(text).replace(/\[\[([^\]]+)\]\]/g, '$1');
  const parts = clean.split(TERM_RE);
  return parts.map((part, i) => {
    const isTerm = MUSIC_TERMS.some(
      (t) => t.toLowerCase() === String(part).toLowerCase(),
    );
    if (!isTerm) return part;
    const done = searched ? searched.has(String(part).toLowerCase()) : false;
    return (
      <span
        key={i}
        onClick={() => onSearch(part)}
        style={{
          color: done ? "inherit" : "var(--zy-primary)",
          cursor: "pointer",
          fontWeight: done ? 400 : 600,
        }}
      >
        {part}
      </span>
    );
  });
}

export function AnalysisPopover({
  open,
  onClose,
  timestamp,
  scene = "桥段前奏，所有乐器暂歇",
  align = "center",
  highlight,
  fullscreen = false,
  summary,
  clockSec,
  alignPct,
}: {
  open: boolean;
  onClose: () => void;
  timestamp?: string;
  scene?: string;
  /** 相对悬浮球的水平对齐：球在屏幕左侧用 left，右侧用 right，中间用 center */
  align?: "left" | "center" | "right";
  /** 真实注脚；传入时覆盖 scene 与四维解析 */
  highlight?: HighlightData | null;
  /** 全屏注脚：铺满屏幕的居中大卡，四维一次性展示 */
  fullscreen?: boolean;
  /** 歌曲简介（无注脚点时展示，零延迟） */
  summary?: string;
  /** 当前播放秒数（时间戳跟歌曲同步） */
  clockSec?: number;
  /** 连续对齐比例 0~1：0=框在球右侧，0.5=居中，1=框在球左侧（拖动时平滑跟随） */
  alignPct?: number;
}) {
  const [openDims, setOpenDims] = useState<DimensionKey[]>(["sing"]);
  const [searched, setSearched] = useState<Set<string> | null>(null);

  // 读取搜索历史：搜过的词不再高亮
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.getSearchHistory) return;
    api.getSearchHistory()
      .then((terms: unknown) => {
        if (Array.isArray(terms)) {
          setSearched(new Set(terms.map((t) => String(t).toLowerCase())));
        }
      })
      .catch(() => {});
  }, []);

  function onSearch(term: string) {
    (window as any).api?.searchTerm?.(term);
    setSearched((prev) => {
      const next = new Set(prev || []);
      next.add(String(term).toLowerCase());
      return next;
    });
  }

  // 有真实注脚时，用它覆盖示例数据；无注脚但有简介时展示简介（零延迟）
  const resolvedScene = highlight ? highlight.core : (summary ?? scene);
  const resolvedStamp = clockSec != null ? fmtTimecode(clockSec) : highlight ? fmtTimecode(highlight.time) : (timestamp ?? "02:08");
  const resolvedAnalysis: Record<DimensionKey, string> = highlight
    ? { sing: highlight.唱, lyrics: highlight.词, compose: highlight.曲, arrange: highlight.编 }
    : ANALYSIS;

  // 水平定位：根据对齐方式设置 left + translateX，避免弹框横向溢出屏幕
  const horiz =
    alignPct != null
      ? { left: `${alignPct * 100}%`, tx: `${-alignPct * 100}%` }
      : align === "left"
        ? { left: "0px", tx: "0%" }
        : align === "right"
          ? { left: "100%", tx: "-100%" }
          : { left: "50%", tx: "-50%" };

  // 全屏注脚：铺满屏幕的居中大卡，四维一次性展示
  if (fullscreen) {
    return (
      <div
        data-el="analysis-popover"
        role="dialog"
        aria-hidden={!open}
        className="fixed inset-0 z-30 flex items-center justify-center p-6"
        style={{
          pointerEvents: open ? "auto" : "none",
          opacity: open ? 1 : 0,
          transition: "opacity 0.3s ease",
          background: "rgba(4,10,14,0.5)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
      >
        <div className="zy-glass w-full max-w-[760px] rounded-[28px] p-8">
          <div className="flex items-start justify-between">
            <span
              className="inline-flex items-center rounded-full px-[14px] py-[5px] font-mono text-[15px] font-semibold tracking-[0.12em]"
              style={{ background: "rgba(6,16,22,0.72)", color: "#eafbff", border: "1px solid rgba(255,255,255,0.14)" }}
            >
              {resolvedStamp}
            </span>
            <button
              type="button"
              aria-label="关闭解析"
              onClick={onClose}
              className="-mr-1 -mt-1 border-0 bg-transparent text-[22px] leading-none transition-opacity hover:opacity-70"
              style={{ color: "var(--zy-text-muted)" }}
            >
              ×
            </button>
          </div>

          <p className="mt-5 text-[26px] md:text-[30px] font-semibold leading-[1.4]" style={{ color: "var(--zy-text)" }}>
            {resolvedScene}
          </p>

          <div className="my-6 h-px w-full" style={{ background: "var(--zy-border)" }} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DIMS.map((k) => {
              const Icon = DIMENSION_ICONS[k];
              return (
                <div
                  key={k}
                  className="rounded-[18px] p-4"
                  style={{ background: "rgba(var(--zy-primary-rgb),0.055)", border: "1px solid var(--zy-border)" }}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon size={22} active />
                    <span className="font-semibold text-[16px]" style={{ color: "var(--zy-primary)" }}>
                      {DIMENSION_HANZI[k]} ·
                    </span>
                  </div>
                  <p className="text-[15px] leading-[1.7]" style={{ color: "var(--zy-text-soft)" }}>
                    {resolvedAnalysis[k]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-el="analysis-popover"
      role="dialog"
      aria-hidden={!open}
      className="zy-glass absolute w-[320px] rounded-[22px] p-5 origin-bottom"
      style={{
        left: horiz.left,
        top: 0,
        border: "none",
        background: "linear-gradient(155deg, rgba(var(--zy-accent-rgb), 0.94) 0%, rgba(var(--zy-secondary-rgb), 0.88) 45%, rgba(255, 255, 255, 0.96) 100%)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        boxShadow: "none",
        pointerEvents: open ? "auto" : "none",
        opacity: open ? 1 : 0,
        transform: open
          ? `translateX(${horiz.tx}) translateY(calc(-100% - 88px)) scale(1)`
          : `translateX(${horiz.tx}) translateY(calc(-100% - 76px)) scale(0.85)`,
        transition: "opacity 0.22s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), left 0.18s ease",
      }}
    >
      <div className="relative z-10">
        {/* 头部：时间戳 + 关闭 */}
        <div className="flex items-start justify-between">
          <span
            className="inline-flex items-center rounded-full px-[10px] py-[3px] font-mono text-[12px] font-semibold tracking-[0.12em]"
            style={{
              background: "rgba(0,0,0,0.08)",
              color: "#4a4a58",
              border: "1px solid rgba(0,0,0,0.10)",
            }}
          >
            {resolvedStamp}
          </span>
          <button
            type="button"
            aria-label="关闭解析"
            onClick={onClose}
            className="-mr-1 -mt-1 border-0 bg-transparent text-[18px] leading-none transition-opacity hover:opacity-70"
            style={{ color: "var(--zy-text-muted)" }}
          >
            ×
          </button>
        </div>

        {/* 场景描述 */}
        <p
          className="mt-[10px] text-[15.5px] font-semibold leading-[1.5]"
          style={{ color: "var(--zy-text)" }}
        >
          {renderTerms(resolvedScene, searched, onSearch)}
        </p>

        {/* 分隔线 */}
        <div
          className="my-[15px] h-px w-full"
          style={{ background: "var(--zy-border)" }}
        />

        {/* 唱词曲编 可同时展开（仅在有注脚点时显示） */}
        {highlight && (
          <>
            <div className="flex gap-[8px]">
              {DIMS.map((k) => {
                const Icon = DIMENSION_ICONS[k];
                const sel = openDims.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={DIMENSION_HANZI[k]}
                    aria-pressed={sel}
                    onClick={() =>
                      setOpenDims((prev) =>
                        prev.includes(k) ? prev.filter((d) => d !== k) : [...prev, k]
                      )
                    }
                    className="flex h-[46px] flex-1 items-center justify-center rounded-[13px] transition-all active:scale-[0.94]"
                    style={{
                      border: sel
                        ? "1.5px solid rgba(var(--zy-primary-rgb),0.85)"
                        : "1px solid var(--zy-border)",
                      background: sel
                        ? "linear-gradient(135deg, rgba(var(--zy-primary-rgb),0.55), rgba(var(--zy-secondary-rgb),0.45) 48%, rgba(0,0,0,0.35))"
                        : "rgba(var(--zy-primary-rgb),0.055)",
                      color: sel ? "#ffffff" : "var(--zy-text-soft)",
                      opacity: sel ? 1 : 0.72,
                      boxShadow: sel
                        ? "0 0 18px rgba(var(--zy-primary-rgb),0.3)"
                        : "none",
                    }}
                  >
                    <Icon size={22} active={sel} />
                  </button>
                );
              })}
            </div>

            {/* 维度解析：grid 折叠/展开，平滑展开（下缘固定、上缘动） */}
            {DIMS.map((k) => (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateRows: openDims.includes(k) ? "1fr" : "0fr",
                  transition: "grid-template-rows 0.25s ease",
                }}
              >
                <div style={{ overflow: "hidden" }}>
                  <p
                    className="mt-[15px] text-[14px] leading-[1.7]"
                    style={{ color: "var(--zy-text-soft)" }}
                  >
                    <span
                      className="mr-1.5 font-semibold"
                      style={{ color: "#4a4a58" }}
                    >
                      {DIMENSION_HANZI[k]} ·
                    </span>
                    {renderTerms(resolvedAnalysis[k], searched, onSearch)}
                  </p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
