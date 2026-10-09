import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { findActiveHighlight } from './logic.js';
import Ball from './components/Ball.jsx';
import BubbleCard from './components/BubbleCard.jsx';
import './ball.css';

function computeTime(s, now) {
  if (!s) return 0;
  const pos = s.positionSec || 0;
  if (s.isPlaying) return pos + (now - (s.at || now)) / 1000;
  return pos;
}

// 忽略 AI 给的时间点（不准），按它的顺序把注脚点均匀铺满整首时长
function redistribute(highlights, duration) {
  if (!highlights || highlights.length < 2 || !duration) return highlights;
  const n = highlights.length;
  return highlights.map((h, i) => ({ ...h, time: Math.round(((i + 0.5) / n) * duration) }));
}

function BallApp() {
  const [source, setSource] = useState({ channel: 'none' });
  const sourceRef = useRef({ channel: 'none' });
  const [scriptMsg, setScriptMsg] = useState(null); // { key, script }
  const [displayHl, setDisplayHl] = useState(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [openDims, setOpenDims] = useState([]);
  const [ballPulsing, setBallPulsing] = useState(false);
  const [cardNonce, setCardNonce] = useState(0);
  const [clockSec, setClockSec] = useState(0);
  const [showGenerating, setShowGenerating] = useState(false);

  const lastHlIdRef = useRef(null);
  const hideTimerRef = useRef(null);
  const ballPulseTimerRef = useRef(null);
  const pinnedRef = useRef(false);
  const scriptRef = useRef(null);
  const redistributedRef = useRef(null);
  const redistributedKeyRef = useRef(null);

  useEffect(() => {
    if (!window.api?.onSource) return;
    const off = window.api.onSource((data) => {
      const s = data || { channel: 'none' };
      sourceRef.current = s;
      // positionSec/at 每 250ms 变一次，但渲染只看标题/歌手/播放态，避免无谓重渲染
      setSource((prev) =>
        prev.title === s.title && prev.artist === s.artist && prev.channel === s.channel && prev.isPlaying === s.isPlaying
          ? prev
          : s
      );
    });
    return () => {
      if (off) off();
    };
  }, []);

  useEffect(() => {
    if (!window.api?.onScript) return;
    const off = window.api.onScript((data) => setScriptMsg(data));
    return () => {
      if (off) off();
    };
  }, []);

  const currentKey = (source.title || '') + ' - ' + (source.artist || '');
  const hasProgress = source.channel !== 'none';
  const script = scriptMsg && scriptMsg.key === currentKey ? scriptMsg.script : null;

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  // 换歌时重置
  useEffect(() => {
    lastHlIdRef.current = null;
    setDisplayHl(null);
    setCardOpen(false);
    setOpenDims([]);
    pinnedRef.current = false;
  }, [currentKey]);

  function triggerCard(hl) {
    setDisplayHl(hl);
    setCardOpen(true);
    setOpenDims([]);
    pinnedRef.current = false;
    setCardNonce((n) => n + 1);
    setBallPulsing(true);
    clearTimeout(ballPulseTimerRef.current);
    ballPulseTimerRef.current = setTimeout(() => setBallPulsing(false), 1000);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!pinnedRef.current) setCardOpen(false);
    }, 6000);
  }

  // 主循环：插值时钟 + 高亮检测
  useEffect(() => {
    let raf;
    const tick = () => {
      const s = sourceRef.current;
      const sc = scriptRef.current;
      const ok = s && s.isPlaying && sc && sc.highlights && s.channel !== 'none';
      if (ok) {
        let hs;
        if (sc.mode === 'creator') {
          hs = sc.highlights;
        } else {
          // 均匀铺满的结果只随「点数 + 时长」变化，缓存起来，避免每帧重新分配
          const dur = s.duration || 240;
          const key = sc.highlights.length + ':' + dur;
          if (redistributedKeyRef.current !== key) {
            redistributedKeyRef.current = key;
            redistributedRef.current = redistribute(sc.highlights, dur);
          }
          hs = redistributedRef.current;
        }
        const t = computeTime(s, Date.now());
        const hl = findActiveHighlight(hs, t);
        const id = hl ? hl.time : null;
        if (id !== lastHlIdRef.current) {
          lastHlIdRef.current = id;
          if (hl) triggerCard(hl);
          else {
            setDisplayHl(null);
            setCardOpen(false);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 每秒刷新当前播放时间
  useEffect(() => {
    const iv = setInterval(() => {
      const s = sourceRef.current;
      if (s && s.isPlaying) setClockSec(computeTime(s, Date.now()));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const playing = !!source.isPlaying;
  const generating = hasProgress && source.title && source.isPlaying && !script;

  // 「正在生成」延迟 1.2 秒再显示：缓存命中时脚本秒回，就不会闪现这个框
  useEffect(() => {
    if (generating) {
      const t = setTimeout(() => setShowGenerating(true), 1200);
      return () => clearTimeout(t);
    }
    setShowGenerating(false);
  }, [generating]);

  function toggleDim(key) {
    setOpenDims((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
    pinnedRef.current = true;
    clearTimeout(hideTimerRef.current);
  }

  let bubble = null;
  if (showGenerating) {
    bubble = (
      <div className="bubble bubble--nowplaying" key="gen">
        <div className="bubble__nowplaying-label">正在生成导览剧本</div>
        <div className="bubble__title">{source.title}</div>
        <div className="bubble__artist">首次约 30–60 秒，之后走缓存</div>
      </div>
    );
  } else if (cardOpen && displayHl) {
    bubble = (
      <BubbleCard
        key={`${displayHl.time}-${cardNonce}`}
        hl={displayHl}
        openDims={openDims}
        onToggleDim={toggleDim}
        clockSec={clockSec}
      />
    );
  } else if (script && source.isPlaying && !displayHl) {
    bubble = (
      <div className="bubble" key="intro">
        <div className="bubble__nowplaying-label">歌曲简介</div>
        <p className="bubble__tech">{script.summary}</p>
      </div>
    );
  }

  const showCard = !!bubble;
  const lastHeightRef = useRef(0);
  // 根据气泡实际高度动态调整悬浮球窗口大小（高度不变就不重复缩放，减少重影）
  useLayoutEffect(() => {
    if (!window.api?.resizeBall) return;
    if (!showCard) {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        window.api.resizeBall('idle');
      }
      return;
    }
    const el = document.querySelector('.bubble');
    if (el) {
      const h = Math.min(Math.ceil(el.offsetHeight) + 20, 800);
      if (h !== lastHeightRef.current) {
        lastHeightRef.current = h;
        window.api.resizeBall('card', h);
      }
    }
  }, [showCard, openDims, displayHl, generating, script]);

  function onBallClick() {
    if (cardOpen) {
      setCardOpen(false);
      pinnedRef.current = false;
    } else if (displayHl) {
      setCardOpen(true);
      pinnedRef.current = true;
      setCardNonce((n) => n + 1);
      clearTimeout(hideTimerRef.current);
    }
  }

  return (
    <div className="ball-root">
      {bubble}
      <Ball playing={playing} pulsing={ballPulsing} onClick={onBallClick} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<BallApp />);
