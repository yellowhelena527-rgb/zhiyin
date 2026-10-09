"use client";

/**
 * 知音 · 四个维度的原创「玻璃凹槽」图标。
 * 视觉：线条像阴刻进玻璃表面 —— 顶部暗内影 + 底部一道亮高光，
 * 淡淡、流畅、简约。全部用 currentColor，便于随文字色改色。
 */

type IconProps = {
  className?: string;
  size?: number;
  /** 凹槽发光强度（选中态更亮） */
  active?: boolean;
};

function Engraved({
  size = 26,
  active,
  className,
  children,
  id,
  bold,
}: IconProps & { children: React.ReactNode; id: string; bold?: boolean }) {
  const glow = bold ? 0.85 : active ? 0.55 : 0.28;
  const dark = bold ? 1 : 0.9;
  const dev = bold ? 0.7 : 0.5;
  const off = bold ? 1 : 0.7;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <defs>
        {bold ? (
          /* 贴合图标形状的很窄一圈淡发光，无内部渐变 */
          <filter id={`carve-${id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="0.6"
              floodColor="rgba(140,236,246,0.7)"
            />
          </filter>
        ) : (
          /* 凹槽：暗色内影从上、亮高光从下，形成「刻入」错觉 */
          <filter id={`carve-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy={off}
              stdDeviation={dev}
              floodColor={`rgba(0,20,28,${dark})`}
            />
            <feDropShadow
              dx="0"
              dy={-off}
              stdDeviation={dev}
              floodColor={`rgba(200,246,252,${glow})`}
            />
          </filter>
        )}
      </defs>
      <g
        stroke="currentColor"
        strokeWidth={bold ? 1.3 : 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={bold ? 0.9 : active ? 0.95 : 0.7}
        filter={`url(#carve-${id})`}
      >
        {children}
      </g>
    </svg>
  );
}

/** 凹槽汉字图标：把单个汉字做成与线条图标同款「阴刻玻璃」质感 */
export function HanziIcon({ char, ...p }: IconProps & { char: string }) {
  const { size = 26, active, className } = p;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        <filter id={`carve-hz-${char}`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0.7" stdDeviation="0.5" floodColor="rgba(0,20,28,0.9)" />
          <feDropShadow
            dx="0"
            dy="-0.7"
            stdDeviation="0.5"
            floodColor={`rgba(200,246,252,${active ? 0.55 : 0.28})`}
          />
        </filter>
      </defs>
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="18"
        fontWeight={600}
        fill="currentColor"
        opacity={active ? 0.96 : 0.72}
        filter={`url(#carve-hz-${char})`}
        style={{ fontFamily: "var(--font-sans, system-ui), sans-serif" }}
      >
        {char}
      </text>
    </svg>
  );
}

/** 唱 — 麦克风，意象版 */
export function SingIcon(p: IconProps) {
  return <MaskIcon {...p} src="./mic-sing.png?v=2" />;
}

/** 词 — 歌词文档（参考图生成，遮罩渲染） */
export function LyricsIcon(p: IconProps) {
  return <MaskIcon {...p} src="./dim-lyrics.png?v=2" />;
}

/** 曲 — 八分音符（重新设计，遮罩渲染） */
export function ComposeIcon(p: IconProps) {
  return <MaskIcon {...p} src="./dim-compose.png?v=3" />;
}

/** 编 — 多轨编排（沿用上一版手画设计） */
export function ArrangeIcon(p: IconProps) {
  return (
    <Engraved {...p} id="arrange">
      {/* 分轨波形：多条横向小块块，粗细统一(高度4)，长短与深浅不一 */}
      <rect x="4" y="7" width="12" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.95" />
      <rect x="18" y="7" width="10" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.5" />
      <rect x="4" y="13" width="7" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.55" />
      <rect x="13" y="13" width="15" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.9" />
      <rect x="4" y="19" width="16" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="22" y="19" width="6" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.45" />
      <rect x="4" y="25" width="9" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.7" />
      <rect x="15" y="25" width="8" height="4" rx="1.4" fill="currentColor" stroke="none" opacity="0.5" />
    </Engraved>
  );
}

/** 统一风格：图片遮罩渲染的线条图标，随 currentColor 着色（与麦克风同款） */
function MaskIcon({
  src,
  size = 26,
  active = false,
  className,
}: IconProps & { src: string }) {
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "currentColor",
        opacity: active ? 0.96 : 0.72,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** 调色盘 — 画板轮廓 + 拇指孔 + 三个色点，极简 */
export function PaletteIcon(p: IconProps) {
  return (
    <Engraved {...p} id="palette">
      <path d="M16 6.5c-6.4 0-10.5 4.6-10.5 9.7 0 4.6 3.4 8.3 7.6 8.3 1.3 0 2.1-.9 2.1-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.7c3.4 0 6.1-2.6 6.1-6C24.5 9.9 20.7 6.5 16 6.5z" />
      <circle cx="11.5" cy="14" r="1.15" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="16.5" cy="11" r="1.15" fill="currentColor" stroke="none" opacity="0.85" />
      <circle cx="20.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" opacity="0.85" />
    </Engraved>
  );
}

/** 导入歌单 — 加号，极简 */
export function PlusIcon(p: IconProps) {
  return (
    <Engraved {...p} id="plus">
      <path d="M16 8v16" />
      <path d="M8 16h16" />
    </Engraved>
  );
}

/** 查看导入 — 放大镜，极简 */
export function SearchIcon(p: IconProps) {
  return (
    <Engraved {...p} id="search">
      <circle cx="14.5" cy="14.5" r="6.5" />
      <path d="M19.5 19.5L25 25" />
    </Engraved>
  );
}

/** 听众 — 对称饱满耳机：头梁弧 + 两侧圆润耳罩，一眼可辨，玻璃刻痕感 */
export function HeadphoneIcon(p: IconProps) {
  return (
    <Engraved {...p} id="headphone">
      {/* 头梁 */}
      <path d="M7 17.5v-1.5a9 9 0 0 1 18 0v1.5" />
      {/* 左耳罩 */}
      <rect x="4.5" y="16.5" width="5.5" height="9" rx="2.6" fill="currentColor" stroke="none" opacity="0.92" />
      {/* 右耳罩 */}
      <rect x="22" y="16.5" width="5.5" height="9" rx="2.6" fill="currentColor" stroke="none" opacity="0.92" />
    </Engraved>
  );
}

/** 创作者 — 魔法棒 + 星芒火花：象征灵感与创作，一眼可辨，玻璃刻痕感 */
export function CreatorIcon(p: IconProps) {
  return (
    <Engraved {...p} id="creator">
      {/* 高音谱号（treble clef）：照参考图——顶部小钩上翘 → 主干下行 → 中部绕成饱满圆圈 → 穿心下垂 → 底部左勾 */}
      <path d="M15.4 30c-2.3 0-4-1.6-4-3.7 0-2 1.5-3.5 3.5-3.5 1.8 0 3.1 1.3 3.1 3.1 0 1.5-1 2.6-2.4 2.6M15.4 30c1.4-6 0.6-11 -0.2-15.4-0.6-3.4-0.9-6 0.8-7.9 1.4-1.6 3.6-1.4 4.6 0.2 1.1 1.7 0.7 4-1.1 5.6-2 1.8-4.9 2.9-7.1 4.9-2 1.8-2.9 4-1.6 6.1 1 1.7 3.3 2.2 5 1" />
      {/* 底部实心小圆点 */}
      <circle cx="15.4" cy="26.4" r="1.5" fill="currentColor" stroke="none" />
    </Engraved>
  );
}

/** 音符 — 八分音符，玻璃刻痕感 */
export function MusicNoteIcon(p: IconProps) {
  return (
    <Engraved {...p} id="note">
      {/* 简洁线条音符：一条笔直竖干 */}
      <path d="M13 23.5V6.5" />
      {/* 实心符头 */}
      <ellipse cx="10.2" cy="23.5" rx="2.9" ry="2.3" fill="currentColor" stroke="none" />
    </Engraved>
  );
}

export type DimensionKey = "sing" | "lyrics" | "compose" | "arrange";

/** 意象图标映射 */
export const DIMENSION_ICONS: Record<
  DimensionKey,
  (props: IconProps) => React.JSX.Element
> = {
  sing: SingIcon,
  lyrics: LyricsIcon,
  compose: ComposeIcon,
  arrange: ArrangeIcon,
};

/** 汉字映射（唱/词/曲/编） */
export const DIMENSION_HANZI: Record<DimensionKey, string> = {
  sing: "唱",
  lyrics: "词",
  compose: "曲",
  arrange: "编",
};
