import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function dedupeByTitle(list) {
  const seen = new Set();
  const out = [];
  for (const s of list || []) {
    const k = String((s && s.title) || '').toLowerCase().replace(/[^a-z0-9一-龥]/g, '');
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function MainApp() {
  const [identity, setIdentity] = useState('listener'); // 'listener' | 'creator'
  const [external, setExternal] = useState(null);
  const [songList, setSongList] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [batchDone, setBatchDone] = useState(false);
  const [batchResults, setBatchResults] = useState(null);
  const [cachedSongs, setCachedSongs] = useState({ listener: [], creator: [] });
  const [dragOver, setDragOver] = useState(null); // 'image' | 'audio' | null

  // 演示模式：内置播放来源，双击即演示（无需外部播放器/插件）
  const DEMO_SONG = { title: '晴天', artist: '周杰伦', duration: 269 };
  const [demoOn, setDemoOn] = useState(false);
  const [demoPos, setDemoPos] = useState(0);
  const demoPosRef = useRef(0);
  const demoTimerRef = useRef(null);
  const progressRef = useRef(null);
  const seekRef = useRef(false);

  function pushDemoSource(isPlaying) {
    window.api?.sendBuiltinSource &&
      window.api.sendBuiltinSource({ title: DEMO_SONG.title, artist: DEMO_SONG.artist, isPlaying, positionSec: demoPosRef.current, duration: DEMO_SONG.duration });
  }

  function toggleDemo() {
    if (demoOn) {
      clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
      setDemoOn(false);
      pushDemoSource(false);
    } else {
      demoPosRef.current = 0;
      setDemoPos(0);
      setDemoOn(true);
      pushDemoSource(true);
      demoTimerRef.current = setInterval(() => {
        demoPosRef.current += 0.25;
        if (demoPosRef.current >= DEMO_SONG.duration) demoPosRef.current = 0;
        setDemoPos(demoPosRef.current);
        pushDemoSource(true);
      }, 250);
    }
  }

  function seekDemo(e) {
    const el = progressRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    demoPosRef.current = frac * DEMO_SONG.duration;
    setDemoPos(demoPosRef.current);
    if (demoOn) pushDemoSource(true);
  }

  function onProgressDown(e) {
    seekRef.current = true;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    seekDemo(e);
  }
  function onProgressMove(e) {
    if (seekRef.current) seekDemo(e);
  }
  function onProgressUp() {
    seekRef.current = false;
  }

  // 卸载时停掉演示计时器
  useEffect(() => () => clearInterval(demoTimerRef.current), []);

  // 创作者上传的 MP3
  const [mp3Name, setMp3Name] = useState('');
  const [mp3Title, setMp3Title] = useState('');
  const [mp3Artist, setMp3Artist] = useState('');
  const [mp3Duration, setMp3Duration] = useState(0);
  const [audioData, setAudioData] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatorResult, setCreatorResult] = useState(null);

  // 外部播放器状态
  useEffect(() => {
    if (!window.api?.onExternalStatus) return;
    const off = window.api.onExternalStatus((s) => setExternal(s));
    return () => {
      if (off) off();
    };
  }, []);

  // 批量进度 / 完成 / 缓存列表
  useEffect(() => {
    if (!window.api?.listCachedSongs) return;
    window.api.listCachedSongs().then(setCachedSongs);
    const offP = window.api.onBatchProgress ? window.api.onBatchProgress(setBatchProgress) : null;
    const offD = window.api.onBatchDone
      ? window.api.onBatchDone((r) => {
          setBatchDone(true);
          setBatchResults(r);
          window.api.listCachedSongs().then(setCachedSongs);
        })
      : null;
    return () => {
      if (offP) offP();
      if (offD) offD();
    };
  }, []);

  function parsePlaylistFile(file) {
    setParsing(true);
    setParseError(null);
    setBatchProgress(null);
    setBatchDone(false);
    setBatchResults(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(',')[1] || '';
        const songs = await window.api.parseScreenshot(base64);
        setSongList(dedupeByTitle(Array.isArray(songs) ? songs : []));
      } catch (err) {
        setParseError('识别失败：' + (err && err.message ? err.message : err));
      } finally {
        setParsing(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (file) parsePlaylistFile(file);
  }

  function loadCreatorFile(file) {
    const base = file.name.replace(/\.(mp3|wav|flac|m4a|aac|ogg)$/i, '');
    setMp3Name(base);
    setMp3Title(base);
    setMp3Artist('');
    setCreatorResult(null);
    setParseError(null);

    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      setMp3Duration(Math.round(audio.duration || 0));
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => URL.revokeObjectURL(url);

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const fmt = ext === 'wav' ? 'wav' : 'mp3';
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(',')[1] || '';
      setAudioData({ base64: b64, format: fmt });
    };
    reader.readAsDataURL(file);
  }

  function handleMp3Upload(e) {
    const file = e.target.files && e.target.files[0];
    if (file) loadCreatorFile(file);
  }

  // 拖拽导入：歌单截图 / 音频文件
  function dropImage(e) {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) parsePlaylistFile(file);
  }
  function dropAudio(e) {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadCreatorFile(file);
  }

  function editSong(i, key, val) {
    setSongList((list) => list.map((s, idx) => (idx === i ? { ...s, [key]: val } : s)));
  }

  function removeSong(i) {
    setSongList((list) => list.filter((_, idx) => idx !== i));
  }

  function startBatch() {
    if (!songList.length || !window.api?.batchGenerate) return;
    setBatchDone(false);
    setBatchResults(null);
    setBatchProgress({ done: 0, total: songList.length });
    window.api.batchGenerate(songList);
  }

  async function generateCreatorSong() {
    if (!audioData || !mp3Title || !window.api?.analyzeAudio) return;
    setAnalyzing(true);
    setParseError(null);
    setCreatorResult(null);
    try {
      const script = await window.api.analyzeAudio(audioData.base64, audioData.format, mp3Title, mp3Artist);
      setCreatorResult(script);
      window.api.listCachedSongs().then(setCachedSongs);
    } catch (err) {
      setParseError('分析失败：' + (err && err.message ? err.message : err));
    } finally {
      setAnalyzing(false);
    }
  }

  const okCount = batchResults ? batchResults.filter((r) => r.ok).length : 0;

  return (
    <div className="main">
      <div className="stage-head">
        <div className="brand">声境 · 耳译</div>
        <div className="brand-sub">音乐导览 · 桌面演示</div>
      </div>

      <div className="demo-bar">
        <button className={`demo-btn ${demoOn ? 'on' : ''}`} onClick={toggleDemo}>
          {demoOn ? '⏸ 停止' : '▶ 演示'}
        </button>
        <div
          className="demo-progress"
          ref={progressRef}
          onPointerDown={onProgressDown}
          onPointerMove={onProgressMove}
          onPointerUp={onProgressUp}
          onPointerCancel={onProgressUp}
        >
          <div className="demo-progress__fill" style={{ width: `${(demoPos / DEMO_SONG.duration) * 100}%` }} />
          <div className="demo-progress__thumb" style={{ left: `${(demoPos / DEMO_SONG.duration) * 100}%` }} />
        </div>
        <span className="demo-time">{fmtTime(demoPos)} / {fmtTime(DEMO_SONG.duration)}</span>
      </div>
      <div className="demo-hint">{demoOn ? '内置播放《晴天 · 周杰伦》 · 看右下角悬浮球' : '无需外部播放器 · 可拖动进度条查看不同注脚'}</div>

      <div className="import-panel">
        {/* 身份选择 */}
        <div className="identity-row">
          <button
            className={`identity-btn ${identity === 'listener' ? 'active' : ''}`}
            onClick={() => setIdentity('listener')}
          >
            听众
          </button>
          <button
            className={`identity-btn ${identity === 'creator' ? 'active' : ''}`}
            onClick={() => setIdentity('creator')}
          >
            创作者
          </button>
        </div>

        {identity === 'listener' ? (
          <>
            <label
              className={`upload-btn ${dragOver === 'image' ? 'dragover' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => { e.preventDefault(); setDragOver('image'); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(null); }}
              onDrop={dropImage}
            >
              上传歌单截图（可拖拽图片到此处）
              <input type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
            </label>

            {parsing && <div className="hint-text">正在识别歌单…（约 10–20 秒）</div>}
            {parseError && <div className="error-text">{parseError}</div>}

            {songList.length > 0 && (
              <>
                <div className="list-title">识别到 {songList.length} 首（可修改后生成）：</div>
                <div className="song-list">
                  {songList.map((s, i) => (
                    <div className="song-row" key={i}>
                      <input value={s.title || ''} placeholder="歌名" onChange={(e) => editSong(i, 'title', e.target.value)} />
                      <input value={s.artist || ''} placeholder="歌手" onChange={(e) => editSong(i, 'artist', e.target.value)} />
                      <button className="row-del" onClick={() => removeSong(i)}>✕</button>
                    </div>
                  ))}
                </div>

                <button className="primary-btn" onClick={startBatch} disabled={!!batchProgress && !batchDone}>
                  开始批量预生成（{songList.length} 首）
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <label
              className={`upload-btn ${dragOver === 'audio' ? 'dragover' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => { e.preventDefault(); setDragOver('audio'); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(null); }}
              onDrop={dropAudio}
            >
              上传你的歌曲（MP3 / WAV，可拖拽）
              <input type="file" accept="audio/*" onChange={handleMp3Upload} style={{ display: 'none' }} />
            </label>

            {mp3Name && (
              <>
                <div className="list-title">歌曲信息（可修改）：</div>
                <div className="song-row">
                  <input value={mp3Title} onChange={(e) => setMp3Title(e.target.value)} placeholder="歌名" />
                  <input value={mp3Artist} onChange={(e) => setMp3Artist(e.target.value)} placeholder="歌手" />
                </div>
                {mp3Duration > 0 && <div className="hint-text">时长约 {mp3Duration} 秒</div>}
                <button className="primary-btn" onClick={generateCreatorSong} disabled={analyzing || !audioData}>
                  {analyzing ? 'AI 正在听…' : 'AI 现场解析'}
                </button>
              </>
            )}

            {analyzing && <div className="progress-info">AI 正在听音频并生成解析…（约 1-2 分钟）</div>}

            {creatorResult && (
              <div className="done-info">
                ✅ 解析完成：{creatorResult.highlights ? creatorResult.highlights.length : 0} 个注脚点
                {creatorResult.summary && <div className="hint-text">{creatorResult.summary}</div>}
              </div>
            )}
          </>
        )}

        {batchProgress && !batchDone && (
          <div className="progress-info">
            正在生成 {batchProgress.done}/{batchProgress.total} · 当前：{batchProgress.title}
          </div>
        )}

        {batchDone && batchResults && (
          <div className="done-info">
            完成：成功 {okCount} / {batchResults.length} 首
            {batchResults.length - okCount > 0 && ` · 失败 ${batchResults.length - okCount} 首`}
          </div>
        )}
      </div>

      <div className="cache-panel">
        <div className="list-title">听众库（{(cachedSongs.listener || []).length} 首）</div>
        <div className="cache-list">
          {(cachedSongs.listener || []).length === 0 ? (
            <div className="hint-text">暂无</div>
          ) : (
            (cachedSongs.listener || []).slice(0, 30).map((s, i) => (
              <div className="cache-item" key={`l${i}`}>{s.title}{s.artist ? ` - ${s.artist}` : ''}</div>
            ))
          )}
        </div>
        <div className="list-title">创作库（{(cachedSongs.creator || []).length} 首）</div>
        <div className="cache-list">
          {(cachedSongs.creator || []).length === 0 ? (
            <div className="hint-text">暂无</div>
          ) : (
            (cachedSongs.creator || []).slice(0, 30).map((s, i) => (
              <div className="cache-item" key={`c${i}`}>{s.title}{s.artist ? ` - ${s.artist}` : ''}</div>
            ))
          )}
        </div>
      </div>

      <div className="status">
        <div className="status-title">外部播放器监听</div>
        {external && external.title ? (
          <div className="status-track">
            {external.title} — {external.artist || '未知歌手'}
            <span className={`status-badge ${external.isPlaying ? 'on' : ''}`}>
              {external.isPlaying ? '播放中' : '已暂停'}
            </span>
          </div>
        ) : (
          <div className="status-empty">未检测到外部播放器</div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<MainApp />);
