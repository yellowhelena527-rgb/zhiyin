"use client";

import { useState } from "react";
import { GuidePanel } from "@/components/zhiyin/guide-panel";
import { AboutCorner } from "@/components/zhiyin/about-corner";
import { NcmGuide } from "@/components/zhiyin/ncm-guide";

/**
 * 知音 · 首屏（1:1 还原原始设计稿「湖蓝舞台」）。
 * 右侧 GuidePanel（导入歌单 / 批量预生成 / 曲目库 / 悬浮球预览）已对接真实 window.api。
 */
export default function Home() {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTerms, setReviewTerms] = useState<string[]>([]);

  async function toggleReview() {
    if (!reviewOpen) {
      try {
        const terms = await (window as any).api?.getSearchHistory?.();
        setReviewTerms(Array.isArray(terms) ? terms : []);
      } catch {
        setReviewTerms([]);
      }
    }
    setReviewOpen((v) => !v);
  }

  return (
    <main
      className="relative min-h-screen overflow-x-hidden px-5 py-14 md:px-[5vw]"
      data-el="zhiyin-shell"
    >
      {/* 背景水波图 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background: "var(--zy-bg)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            "url('https://cdn.eazo.ai/user-contents/design-variant-images/1bd4cedcc7d44b20b39c716e38a08cb4.png')",
          backgroundSize: "160%",
          backgroundPosition: "center calc(50% - 3.5cm)",
          filter: "saturate(1.05) contrast(0.98) blur(1.5px)",
          animation: "zy-drift-smooth 26s ease-in-out infinite",
        }}
      />
      {/* 主题色染色层：把整个背景氛围染上当前主题色，随换色统一变化 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background: "var(--zy-primary)",
          mixBlendMode: "color",
          opacity: 0.55,
        }}
      />
      {/* 主题色氛围光晕：中心亮、四周沉，强化主题色存在感 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(70% 60% at 38% 34%, rgba(var(--zy-accent-rgb), 0.16), transparent 60%), radial-gradient(95% 85% at 46% 46%, rgba(var(--zy-secondary-rgb), 0.16), rgba(var(--zy-primary-rgb), 0.10) 46%, transparent 74%)",
        }}
      />
      {/* 蒙版：左浓右淡 + 边缘柔化渐隐，让文字/面板清晰又不显生硬 */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(5,14,19,0.34), rgba(5,14,19,0.06) 46%, rgba(5,14,19,0.5))",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(4,10,14,0.55) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 z-0 h-40"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(4,10,14,0.5))",
        }}
      />
      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-112px)] max-w-[1440px] items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(310px,340px)] md:gap-[clamp(24px,7vw,132px)]">
        {/* ── 左侧舞台 ───────────────────────────────── */}
        <section
          data-el="ambient-stage"
          className="flex min-w-0 flex-col justify-between gap-10 self-stretch pt-[9vh] pb-3"
        >
          <div className="flex flex-col items-start">
            <h1
              className="mt-0 max-w-[650px] font-heading font-semibold leading-[1.08] tracking-[-0.01em]"
              style={{
                fontSize: "clamp(48px, 7vw, 104px)",
                color: "var(--zy-text)",
              }}
            >
              恰到好处的
              <br />
              <i
                className="not-italic"
                style={{ color: "var(--zy-accent)" }}
              >
                音乐注脚
                <span style={{ fontSize: "0.5em" }}>。</span>
              </i>
            </h1>
            <p
              className="ml-[24px] mt-[22px] max-w-[340px] text-[14px] leading-[1.65]"
              style={{ color: "var(--zy-text-soft)" }}
            >
              Please enjoy every musical second
            </p>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={toggleReview}
              className="flex items-center gap-[11px] font-mono text-[11px] tracking-[0.08em]"
              style={{ color: "var(--zy-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: "var(--zy-primary)",
                  boxShadow: "0 0 18px var(--zy-primary)",
                  animation: "zy-pulse 2.8s ease-in-out infinite",
                }}
              />
              REVIEW
            </button>

            {reviewOpen && (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[240px]">
                <div className="zy-glass rounded-[16px] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--zy-text)" }}>搜索历史</span>
                    <button
                      type="button"
                      onClick={() => setReviewOpen(false)}
                      className="border-0 bg-transparent text-[18px] leading-none"
                      style={{ color: "var(--zy-text-muted)", cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                  {reviewTerms.length === 0 ? (
                    <p className="text-[12px]" style={{ color: "var(--zy-text-muted)" }}>还没有搜索过任何音乐名词</p>
                  ) : (
                    <div className="grid max-h-[260px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                      {reviewTerms.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onClick={() => (window as any).api?.searchTerm?.(term)}
                          className="rounded-[10px] px-2.5 py-1.5 text-left text-[12px]"
                          style={{ background: "rgba(var(--zy-primary-rgb), 0.08)", border: "1px solid var(--zy-border)", color: "var(--zy-text)", cursor: "pointer" }}
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── 右侧玻璃面板（顶部对齐，使其位于悬浮球的左上方） ────── */}
        <div>
          <GuidePanel />
        </div>
      </div>

      {/* ── 左上角 网易云实时同步引导 ────────────── */}
      <NcmGuide />

      {/* ── 右上角 About（hover 分离出文本框） ────────────── */}
      <AboutCorner />
    </main>
  );
}
