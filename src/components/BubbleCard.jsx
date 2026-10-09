const DIMS = [
  { key: '唱', label: '唱' },
  { key: '词', label: '词' },
  { key: '曲', label: '曲' },
  { key: '编', label: '编' },
];

function fmtStamp(t) {
  const s = Math.max(0, Math.floor(t || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

// 音乐类专有名词词典（长的在前，避免短词误匹配）
const MUSIC_TERMS = [
  '分解和弦', '三度叠置', '延迟尾音', '混响尾音', '颗粒感', '层次感', '空间感', '立体声', '五声音阶', '属七和弦',
  '合成器', '木吉他', '电吉他', '鼓组', '军鼓', '底鼓', '踩镲', '镲片', '弦乐', '管乐', '贝斯', '钢琴', '吉他',
  '前奏', '主歌', '副歌', '间奏', '桥段', '尾声', '主唱', '伴唱', '和声', '和弦', '编曲', '配器', '混音', '母带',
  '人声', '气声', '假声', '颤音', '滑音', '转音', '音色', '声场', '声相', '干声', '湿声', '泛音', '音阶', '调式',
  '大调', '小调', '转调', '升调', '降调', '扫弦', '拨弦', '指弹', '揉弦', '滑弦', '三度', '五度', '共鸣', '咬字',
  '混响', '延迟', '回声', '压缩', '均衡', '失真', '过载', '节拍', '律动', '鼓点', '采样', '复调', '音域', '尾音',
  '音程跨度', '音程', '转位', '模进', '对位', '终止式', '半音', '全音', '切分音', '三连音', '附点', '弱起', '离调', '挂留音', '经过音', '增和弦', '减和弦', '声码器',
  '三和弦', '七和弦', '九和弦', '挂四和弦', '增三和弦', '减七和弦', '半减七和弦', '属和弦', '下属和弦', '主和弦', '借用和弦', '调式互换', '拿波里和弦', '持续音', '踏板音', '功能进行',
  '纯四度', '纯五度', '增四度', '减五度', '大六度', '小七度', '大七度', '小二度', '大二度', '十二平均律', '半音阶', '全音阶', '多利亚', '弗里几亚', '利底亚', '混合利底亚', '洛克里亚',
  '拍号', '复合节拍', '复拍子', '五连音', '织体', '声部', '对位法', '卡农', '赋格', '动机', '主题', '变奏',
  '侧链压缩', '侧链', '门限', '限制器', '干湿比', '发送', '返送', '总线', '响度', '立体声成像', '中置', '谐波', '饱和', '磁带饱和', '前级', '话放', '自动调音', '音准修正', '频谱', '削波',
  '胸声', '头声', '混声', '咽音', '强混', '弱混', '共鸣腔', '气息',
  'reverb', 'delay', 'echo', 'compressor', 'distortion', 'synthesizer', 'synth', 'arpeggio', 'vibrato', 'tremolo', 'sustain', 'pluck', 'strum', 'riff', 'bassline', 'kick', 'snare', 'breakdown', 'fade', 'pan', 'EQ',
  'limiter', 'sidechain', 'saturation', 'harmonics', 'sub-bass', 'glide', 'portamento', 'legato', 'staccato', 'formant', 'transient', 'Auto-Tune',
].sort((a, b) => b.length - a.length);

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const TERM_RE = new RegExp('(' + MUSIC_TERMS.map(escapeReg).join('|') + ')', 'gi');

function TermSpan({ term }) {
  return (
    <span
      className="term"
      title={`搜索「${term}」`}
      onClick={() => window.api && window.api.searchTerm && window.api.searchTerm(term)}
    >
      {term}
    </span>
  );
}

// 把文本里的音乐术语（含 AI 的 [[术语]] 标记 + 字典自动识别）渲染成可点击的词
function renderTerms(text) {
  if (!text) return text;
  // 先去掉 AI 的 [[ ]] 标记，统一交给字典高亮
  const clean = String(text).replace(/\[\[([^\]]+)\]\]/g, '$1');
  const parts = clean.split(TERM_RE);
  return parts.map((part, i) =>
    MUSIC_TERMS.some((t) => t.toLowerCase() === String(part).toLowerCase()) ? (
      <TermSpan key={i} term={part} />
    ) : (
      part
    )
  );
}

export default function BubbleCard({ hl, openDims, onToggleDim, clockSec }) {
  return (
    <div className="bubble">
      <div className="bubble__stamp mono">{fmtStamp(clockSec)}</div>
      <p className="bubble__tech">{renderTerms(hl.core)}</p>

      <div className="dims">
        {DIMS.map((d) => (
          <button
            key={d.key}
            className={`dim ${openDims.includes(d.key) ? 'dim--active' : ''}`}
            onClick={() => onToggleDim(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {DIMS.filter((d) => openDims.includes(d.key) && hl[d.key]).map((d) => (
        <p key={d.key} className="bubble__creative">
          <span className="dim-name">{d.label} · </span>
          {renderTerms(hl[d.key])}
        </p>
      ))}
    </div>
  );
}
