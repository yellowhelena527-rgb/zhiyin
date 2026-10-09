"use client";

import { useState } from "react";

/**
 * 右上角「关于」入口。
 * 圆形玻璃按钮，点击弹出知音版本与隐私说明（不再是无业务逻辑的占位）。
 */
export function AboutCorner() {
  const [open, setOpen] = useState(false);

  return (
    <div
      data-el="about-corner"
      className="fixed right-[max(26px,4vw)] top-[max(22px,3vw)] z-40"
    >
      <button
        type="button"
        aria-label="关于知音"
        onClick={() => setOpen((v) => !v)}
        className="group flex h-[42px] w-[42px] items-center justify-center rounded-full transition-all duration-300 active:scale-[0.94]"
        style={{
          background: "rgba(var(--zy-bg-rgb), 0.5)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: "1px solid var(--zy-border)",
          boxShadow:
            "0 8px 22px rgba(0,0,0,0.28), inset 0 1px rgba(255,255,255,0.12)",
          color: "var(--zy-text-soft)",
        }}
      >
        {/* 人形轮廓 */}
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="transition-colors duration-300 group-hover:text-[var(--zy-primary)]"
        >
          <circle
            cx="12"
            cy="8.2"
            r="3.6"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M4.8 20c0-3.8 3.2-6.4 7.2-6.4s7.2 2.6 7.2 6.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[52px] z-50 w-[280px]">
          <div className="zy-glass rounded-[16px] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: "var(--zy-text)" }}>
                关于知音
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-0 bg-transparent text-[18px] leading-none"
                style={{ color: "var(--zy-text-muted)", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <p className="m-0 text-[12px] leading-[1.6]" style={{ color: "var(--zy-text-soft)" }}>
              知音 · 音乐注脚悬浮球 v1.0.0
            </p>
            <p className="mt-2 m-0 text-[11.5px] leading-[1.6]" style={{ color: "var(--zy-text-muted)" }}>
              隐私：创作者模式会把整首歌音频、歌单导入会把截图发送给你在 config.json 中配置的 AI
              服务商解析；听众模式默认会联网抓取真实歌词与 30 秒音频预览作注脚打底，可在
              config.json 设 <span className="font-mono">enrichAudioEnabled: false</span> 关闭音频打底。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
