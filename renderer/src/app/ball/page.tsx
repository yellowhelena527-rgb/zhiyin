"use client";

import { useEffect } from "react";
import { FloatingOrb, applyPalette } from "@/components/zhiyin/guide-panel";

/**
 * 悬浮球独立窗口页面（导出为 out/ball.html）。
 * 透明置顶窗：html/body/#root 全透明、overflow hidden。
 * FloatingOrb 以 live 模式运行：悬浮球 + 上方跟随气泡（非全屏），
 * 订阅 onSource/onScript 按 positionSec 自动弹注脚，拖动走 moveBall，常驻不消失。
 * 主题色通过 onTheme 与主窗口同步。
 */
export default function BallPage() {
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.onTheme) return;
    const off = api.onTheme((p: any) => {
      if (p) applyPalette(p, false);
    });
    return () => off && off();
  }, []);

  // 鼠标在球/气泡上时关闭点击穿透，其余区域穿透（避免挡住主窗口标题栏）；拖动中不切换
  useEffect(() => {
    const api = (window as any).api;
    if (!api?.setIgnoreMouseEvents) return;
    let dragging = false;
    let lastInteractive: boolean | null = null;
    const apply = (interactive: boolean) => {
      if (interactive !== lastInteractive) {
        lastInteractive = interactive;
        api.setIgnoreMouseEvents(!interactive);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (dragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const interactive = !!el && !!(el.closest('[data-el="floating-orb"]') || el.closest('[data-el="analysis-popover"]'));
      apply(interactive);
    };
    const onDown = () => { dragging = true; };
    const onUp = (e: MouseEvent) => {
      dragging = false;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const interactive = !!el && !!(el.closest('[data-el="floating-orb"]') || el.closest('[data-el="analysis-popover"]'));
      apply(interactive);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <>
      {/* 强制透明：覆盖全局背景色，适配透明置顶窗 */}
      <style>{`
        html, body { background: transparent !important; background-color: transparent !important; overflow: hidden !important; margin: 0; }
        body > * { background: transparent !important; background-color: transparent !important; }
        :root { --zy-text: #3a3a48; --zy-text-soft: #3a3a4e; --zy-text-muted: #55556a; }
      `}</style>
      <div
        data-el="ball-root"
        className="fixed inset-0"
        style={{ background: "transparent", overflow: "hidden" }}
      >
        <FloatingOrb live />
      </div>
    </>
  );
}
