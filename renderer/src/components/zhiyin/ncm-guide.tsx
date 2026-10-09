"use client";

import { useEffect, useState } from "react";

/**
 * 网易云「零延迟」接入引导。
 * 引导用户依次装好 BetterNCM → InfLink-rs → 知音桥接插件，最后重启网易云自动连接。
 * 每一步都有实时状态检测；知音桥接插件可「一键安装」（复制到 C:\betterncm\plugins）。
 */

type NcmStatus = {
  connected: boolean;
  port: number;
  betterNcmInstalled: boolean;
  inflinkInstalled: boolean;
  pluginInstalled: boolean;
};

type Step = {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  action?: { label: string; disabled?: boolean; run: () => void };
};

const api = () => (typeof window !== "undefined" ? (window as any).api : undefined);

export function NcmGuide() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<NcmStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);

  async function refresh() {
    try {
      const s = await api()?.getNcmStatus?.();
      setStatus(s || null);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh();
    const off = api()?.onNcmStatus?.((s: NcmStatus) => setStatus(s));
    const iv = setInterval(refresh, 3000);
    return () => {
      if (off) off();
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install() {
    setInstalling(true);
    setInstallMsg(null);
    try {
      const r = await api()?.installNcmPlugin?.();
      if (r?.ok) {
        setInstallMsg("✅ 已安装，重启网易云后生效");
      } else {
        setInstallMsg("安装失败：" + (r?.error || "未知错误"));
      }
      await refresh();
    } catch {
      setInstallMsg("安装失败");
    } finally {
      setInstalling(false);
    }
  }

  const steps: Step[] = status
    ? [
        {
          key: "bncm",
          title: "安装 BetterNCM",
          desc: "网易云插件框架",
          done: !!status.betterNcmInstalled,
          action: status.betterNcmInstalled
            ? undefined
            : { label: "打开下载页", run: () => api()?.openNcmDownload?.() },
        },
        {
          key: "inflink",
          title: "安装 InfLink-rs",
          desc: "负责读取网易云实时进度",
          done: !!status.inflinkInstalled,
          action: status.inflinkInstalled
            ? undefined
            : { label: "打开下载页", run: () => api()?.openInflinkDownload?.() },
        },
        {
          key: "plugin",
          title: "安装知音桥接插件",
          desc: "把实时进度推给知音",
          done: !!status.pluginInstalled,
          action: status.pluginInstalled
            ? undefined
            : { label: installing ? "安装中…" : "一键安装", disabled: installing, run: install },
        },
        {
          key: "conn",
          title: "重启网易云并播放",
          desc: status.connected ? "✅ 实时同步中" : "等待连接…",
          done: !!status.connected,
        },
      ]
    : [];

  return (
    <div
      data-el="ncm-guide"
      className="fixed left-[max(26px,4vw)] top-[max(22px,3vw)] z-40"
    >
      <button
        type="button"
        aria-label="网易云实时同步"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        className="group flex h-[42px] w-[42px] items-center justify-center rounded-full transition-all duration-300 active:scale-[0.94]"
        style={{
          background: "rgba(var(--zy-bg-rgb), 0.5)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: status?.connected
            ? "1px solid var(--zy-primary)"
            : "1px solid var(--zy-border)",
          boxShadow:
            "0 8px 22px rgba(0,0,0,0.28), inset 0 1px rgba(255,255,255,0.12)",
          color: status?.connected ? "var(--zy-primary)" : "var(--zy-text-soft)",
        }}
      >
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="transition-colors duration-300"
        >
          <path
            d="M4 13a8 8 0 0 1 16 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect x="3" y="13" width="4.5" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <rect x="16.5" y="13" width="4.5" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[52px] z-50 w-[300px]">
          <div className="zy-glass rounded-[16px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold" style={{ color: "var(--zy-text)" }}>
                网易云 · 实时同步
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

            <p className="mb-3 text-[12px] leading-[1.6]" style={{ color: "var(--zy-text-muted)" }}>
              想让网易云也做到「零延迟」逐句注脚，按下面 4 步装好，重启网易云后会自动连接。
            </p>

            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {steps.map((s) => (
                <li
                  key={s.key}
                  className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2"
                  style={{
                    background: "rgba(var(--zy-primary-rgb), 0.06)",
                    border: "1px solid var(--zy-border)",
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{
                          background: s.done ? "var(--zy-primary)" : "var(--zy-text-muted)",
                        }}
                      />
                      <span className="truncate text-[12px] font-medium" style={{ color: "var(--zy-text)" }}>
                        {s.title}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--zy-text-muted)" }}>
                      {s.desc}
                    </div>
                  </div>
                  {s.action && (
                    <button
                      type="button"
                      disabled={s.action.disabled}
                      onClick={s.action.run}
                      className="shrink-0 rounded-[8px] px-2 py-1 text-[11px] font-medium"
                      style={{
                        background: "rgba(var(--zy-primary-rgb), 0.16)",
                        border: "1px solid var(--zy-border)",
                        color: "var(--zy-accent)",
                        cursor: s.action.disabled ? "not-allowed" : "pointer",
                        opacity: s.action.disabled ? 0.6 : 1,
                      }}
                    >
                      {s.action.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>

            {installMsg && (
              <p className="mt-3 text-[12px]" style={{ color: "var(--zy-text-soft)" }}>
                {installMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
