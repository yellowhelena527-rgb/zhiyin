const fs = require('fs');
const path = require('path');
const { searchSong, getLyric, parseLrc } = require('./neteasemusic.cjs');
const { searchSong: qqSearchSong, getLyric: qqGetLyric } = require('./qqmusic.cjs');
const { getConfig, listenerDir, creatorDir } = require('./paths.cjs');

const LISTENER_DIR = listenerDir();
const CREATOR_DIR = creatorDir();

function loadConfig() {
  return getConfig();
}

// 取可用的 fetch：Electron 主进程里用 net.fetch（Chromium 网络栈，尊重系统代理，
// 能连上被墙的 Google 服务）；纯 Node 环境退回全局 fetch。
function getFetch() {
  try {
    const { net } = require('electron');
    if (net && typeof net.fetch === 'function') return net.fetch;
  } catch (e) { /* 非 Electron 环境 */ }
  return globalThis.fetch;
}

function buildPrompt(title, artist, durationSec, audioFacts, lyricsFacts) {
  const hasDur = durationSec && durationSec > 0;
  const durLine = hasDur ? `时长约 ${durationSec} 秒` : '时长未知，请按这首歌的实际时长估算';
  const rangeLine = hasDur ? `从 0 到 ${durationSec}` : '从歌曲开始到结束';
  const factsBlock = audioFacts
    ? `\n【真实音频分析】（这首歌真实音频的客观听感，可靠性高，写注脚必须与之一致，不得编造与之矛盾的细节）：\n${audioFacts}`
    : '';
  const lyricsBlock = lyricsFacts
    ? `\n【真实歌词】（这首歌的真实歌词，带时间戳，「词」维度的注脚必须严格基于这些真实歌词，禁止编造歌词原文；可引用真实歌词片段）：\n${lyricsFacts}`
    : '';
  // 没有真实音频时（听众模式常态），明确禁止编造唱/曲/编的「听感细节」
  const noAudioNote = audioFacts
    ? ''
    : '【重要】本任务没有提供真实音频。唱/曲/编基于歌词与乐理常识，用肯定的语气直接陈述推断结论；拿不准的具体细节（精确和弦名、具体混音参数）直接不写。';
  return [
    `针对歌曲《${title}》（歌手：${artist}，${durLine}），请做一份「音乐导览剧本」。${factsBlock}${lyricsBlock}`,
    noAudioNote,
    '',
    '要求：',
    '1. 找出这首歌里「有意思、值得注脚」的时刻，给 10-15 个，${rangeLine} 分布全曲；',
    '2. 每个时刻从「唱、词、曲、编」四个角度各给一段解析（2-4 句），要具体写明乐器、手法、音色、混音/编曲细节、处理意图与效果；',
    '3. 语言要「下沉」：用大白话，让完全没有音乐背景的普通听众也能看懂；',
    '4. 专业术语必须用双方括号标注成 [[术语]]（例如 [[混响]]、[[合成器]]、[[底鼓]]），但不要在括号后面写任何解释文字；复合术语要整体标注（[[胸腔共鸣]]），不要拆开只括后半截（胸腔[[共鸣]]）；',
    '5. 每个时刻再给一个 core：一句话点出最核心最出彩的地方；',
    '6. 客观讲事实与创作意图，不做情绪化评判，不空泛、不套话。',
    '7. 全部内容（summary、core、唱/词/曲/编）一律用中文输出，禁止使用英文。',
    '8. 对冷门或信息不足的歌曲要克制：不要编造歌词原文、具体和弦名/乐器/精确时间点；拿不准的细节直接不写、宁可写得通用。全文禁止使用「可能」「大概」「似乎」「像是」这类不确定措辞，一律用肯定的语气写。',
    '',
    '请只输出一个 JSON 对象，结构如下（不要输出任何其它文字）：',
    '{',
    '  "summary": "一句话点出这首歌最有记忆点的部分（最抓耳的副歌、最有名的旋律，或最戳人的那句词），要客观准确、贴合这首歌，不要编造听不到的具体细节",',
    '  "highlights": [',
    '    {',
    '      "time": 秒数,',
    '      "core": "这个时刻最核心最出彩的一句话",',
    '      "唱": "演唱/人声角度的注脚",',
    '      "词": "歌词/词作角度的注脚",',
    '      "曲": "旋律/作曲角度的注脚",',
    '      "编": "编曲/配器角度的注脚"',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function stripJsonFence(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function chatCompletion(messages, { model, maxTokens = 4000, jsonMode = false } = {}) {
  const cfg = loadConfig();
  if (!cfg.deepseekApiKey) throw new Error('缺少 deepseekApiKey');
  const body = {
    model: model || cfg.deepseekModel || 'deepseek-v4-pro',
    messages,
    temperature: 0.4,
    max_tokens: maxTokens,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(`${cfg.deepseekBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.deepseekApiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('DeepSeek API error: ' + res.status + ' ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  return { content: msg ? msg.content || '' : '', usage: data.usage || null };
}

async function generateSongScript(title, artist, durationSec, model, audioFacts, lyricsFacts) {
  const { content, usage } = await chatCompletion(
    [
      { role: 'system', content: '你是资深音乐制作分析助手，只输出严格合法的 JSON，且所有内容一律使用中文。' },
      { role: 'user', content: buildPrompt(title, artist, durationSec, audioFacts, lyricsFacts) },
    ],
    { model, maxTokens: 24000, jsonMode: true }
  );
  const script = JSON.parse(stripJsonFence(content || '{}'));
  return { script, usage };
}

function normalizeTitle(t) {
  let s = String(t || '').trim();
  // 去掉括号里的副标题/版本标注（中英文括号都算），如 "(把错都推给我吧)" "(Remix)"
  s = s.replace(/[（(][^（()）]*[）)]/g, '');
  // 去掉 feat./ft./featuring 之后的附加信息
  s = s.replace(/\b(?:feat|ft|featuring)\.?\b.*$/i, '');
  return s.toLowerCase().replace(/[^a-z0-9一-龥]/g, '');
}

// 规范化歌手名（用于缓存 key，区分同名歌的不同版本/翻唱/现场）
function normalizeArtist(a) {
  return String(a || '').trim().toLowerCase().replace(/[^a-z0-9一-龥]/g, '');
}

// 缓存 key：歌名 + 歌手。用 '__' 分隔（Windows 文件名安全，且 normalize* 不会产出 '_'）。
function cacheKey(title, artist) {
  const t = normalizeTitle(title);
  const a = normalizeArtist(artist);
  return a ? `${t}__${a}` : t;
}

// 把真实歌词 LRC 行拼成给 AI 打底的「真实歌词」文本；拿不到返回 null
function formatLyricsFacts(lines) {
  if (!lines || !lines.length) return null;
  return lines.slice(0, 60).map((l) => {
    const m = Math.floor(l.time / 60);
    const s = Math.floor(l.time % 60);
    return `[${m}:${String(s).padStart(2, '0')}] ${l.text}`;
  }).join('\n');
}

// 用真实歌词时间戳钉住注脚时间点（听众模式时间点不再靠 AI 猜秒数）。
// 返回是否成功（成功则前端直接使用这些 time，不再均匀重铺）。
function snapHighlightsToRealTimes(script, lyricLines, durationSec) {
  const hs = script && Array.isArray(script.highlights) ? script.highlights : [];
  if (hs.length < 2) return false;
  const times = (lyricLines || [])
    .map((l) => l && l.time)
    .filter((t) => typeof t === 'number' && t >= 0);
  if (times.length < 2) return false;
  const anchors = Array.from(new Set(times)).sort((a, b) => a - b);
  // 按 AI 原始时间排序后，均匀映射到真实歌词时间点上（保序、保单调）
  const ordered = [...hs].sort((a, b) => (a.time || 0) - (b.time || 0));
  const n = ordered.length;
  for (let i = 0; i < n; i++) {
    const idx = n === 1 ? 0 : Math.round((i * (anchors.length - 1)) / (n - 1));
    ordered[i].time = Math.round(anchors[idx]);
  }
  // 前端按升序查找当前注脚点，这里确保 highlights 最终按 time 升序
  hs.sort((a, b) => (a.time || 0) - (b.time || 0));
  return true;
}

// 无 API Key 时的演示注脚（诚实标注占位，不伪造具体解析）
function buildFallbackScript(title, artist, durationSec) {
  const dur = durationSec && durationSec > 0 ? durationSec : 240;
  const count = 4;
  const highlights = [];
  for (let i = 0; i < count; i++) {
    highlights.push({
      time: Math.round(((i + 0.5) / count) * dur),
      core: '演示注脚：配置 API Key 后即可生成真实解析。',
      唱: '这里是占位内容，配置 Key 后自动生成演唱/人声解析。',
      词: '这里是占位内容，配置 Key 后自动生成歌词/词作解析。',
      曲: '这里是占位内容，配置 Key 后自动生成旋律/作曲解析。',
      编: '这里是占位内容，配置 Key 后自动生成编曲/配器解析。',
    });
  }
  return {
    title,
    artist,
    mode: 'listener',
    mock: true,
    timed: true,
    summary: '未配置 API Key，当前为演示注脚。',
    highlights,
  };
}

// ── Google Gemini 原生 API（generateContent）────────────────────────────
// 直连 Google，不再经 openai-next 中转。creatorApiKey 即 Gemini 的 API Key。
// 返回 { content, usage }，usage 归一化成 { prompt_tokens, completion_tokens }。
async function geminiGenerateContent({ model, text, inlineData, jsonMode = false, maxTokens = 24000, timeoutMs = 60000 }) {
  const cfg = loadConfig();
  if (!cfg.creatorApiKey) throw new Error('缺少 Gemini API Key（config.json 的 creatorApiKey）');
  const base = (cfg.creatorBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const parts = [];
  if (text) parts.push({ text });
  if (inlineData) parts.push({ inline_data: { mime_type: inlineData.mime, data: inlineData.base64 } });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
  };
  if (jsonMode) body.generationConfig.responseMimeType = 'application/json';

  // 503=高负载 / 429=限流 / 5xx 瞬时错误：退避重试最多 3 次
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await getFetch()(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.creatorApiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const status = res.status;
        const snippet = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error('Gemini API error: ' + status + ' ' + snippet);
      }
      const d = await res.json();
      const cand = d.candidates && d.candidates[0];
      // 思考型模型会把推理过程也放进 parts（thought: true），这里只取真正的输出
      const content = (cand && cand.content && cand.content.parts
        ? cand.content.parts.filter((p) => p && !p.thought).map((p) => (p && p.text ? p.text : '')).join('')
        : '');
      const usage = d.usageMetadata
        ? {
            prompt_tokens: d.usageMetadata.promptTokenCount || 0,
            completion_tokens: (d.usageMetadata.candidatesTokenCount || 0) + (d.usageMetadata.thoughtsTokenCount || 0),
          }
        : null;
      return { content, usage };
    } catch (e) {
      const msg = String((e && e.message) || e);
      const retriable = /503|429|5\d\d|overloaded|timeout|aborted/i.test(msg);
      if (attempt < 2 && retriable) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error('Gemini 调用失败（多次重试后仍失败）');
}

// 根据文件扩展名猜 MIME（Gemini 原生 inline_data 需要精确 MIME 类型）
function guessMime(format) {
  const f = String(format || '').toLowerCase();
  const map = {
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo', m4v: 'video/mp4', flv: 'video/x-flv',
  };
  if (map[f]) return map[f];
  const VIDEO = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'flv']);
  return VIDEO.has(f) ? `video/${f}` : `audio/${f}`;
}

// 快速文本生成（走 Gemini 原生，比 DeepSeek 推理快，用于批量预生成）
async function generateSongScriptFast(title, artist, durationSec, audioFacts, lyricsFacts) {
  const cfg = loadConfig();
  const { content, usage } = await geminiGenerateContent({
    model: cfg.creatorAudioModel || 'gemini-3.5-flash',
    text: buildPrompt(title, artist, durationSec, audioFacts, lyricsFacts),
    jsonMode: true,
    maxTokens: 24000,
  });
  const script = JSON.parse(stripJsonFence(content || '{}'));
  return { script, usage };
}

// ── 真实音源增强：上网找这首歌的真实音频（iTunes 30 秒预览），用 Gemini 听一遍，
//    把客观听感喂给文本生成，避免对冷门歌凭空编造 ─────────────────────────────

// 免费 iTunes 搜索接口（无需 key）：按「歌名 歌手」找真实音源预览
async function searchItunesPreview(title, artist) {
  const term = encodeURIComponent(`${title} ${artist || ''}`.trim());
  const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const d = await res.json();
  const r = d.results && d.results[0];
  if (!r || !r.previewUrl) return null;
  return { previewUrl: r.previewUrl, trackName: r.trackName, artistName: r.artistName };
}

// 下载音频 → base64（带 MIME，供 image_url 发送）
async function fetchAudioBase64(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (url.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || 'm4a';
  const mimeMap = { m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav', mp4: 'audio/mp4' };
  const mime = mimeMap[ext.toLowerCase()] || 'audio/mp4';
  return { base64: buf.toString('base64'), mime };
}

// 30 秒真实片段分析：只报告「真实听到」的客观事实，用于给整首歌写注脚时打底
const PREVIEW_AUDIO_PROMPT = [
  '你是一位专业音乐分析。请「听」这段音频——它是歌曲《TITLE》（歌手：ARTIST）的一小段真实片段。',
  '只基于你**真实听到的**内容，输出这首歌的客观事实（不要推断、不要补全你没听到的部分）。',
  '1. 曲风/风格；',
  '2. 唱腔特点（音色、真假声、气息、咬字等）；',
  '3. 能听清的歌词片段（听不清就写「未听清」，禁止编造）；',
  '4. 编曲/配器（有哪些乐器、音色、织体）；',
  '5. 混音/制作风格（空间感、响度、效果器痕迹等）。',
  '全部用中文输出。只输出 JSON：{"genre":"...","vocal":"...","lyrics":"...","instruments":"...","production":"..."}',
].join('\n');

async function analyzePreviewAudio({ base64, mime }, title, artist) {
  const cfg = loadConfig();
  if (!cfg.creatorApiKey) return null;
  const model = cfg.previewAudioModel || cfg.creatorAudioModel || 'gemini-3.5-flash';
  try {
    const { content } = await geminiGenerateContent({
      model,
      text: PREVIEW_AUDIO_PROMPT.replace('TITLE', title).replace('ARTIST', artist || '未知'),
      inlineData: { mime, base64 },
      jsonMode: true,
      maxTokens: 2000,
      timeoutMs: 45000,
    });
    return JSON.parse(stripJsonFence(content || '{}'));
  } catch (e) {
    // 静默回退纯文本（真实音源增强是可选增强）
    return null;
  }
}

// 串起「搜索 → 下载 → Gemini 听一遍」，任一步失败都返回 null（静默回退纯文本）
async function enrichWithRealAudio(title, artist) {
  try {
    const preview = await searchItunesPreview(title, artist);
    if (!preview) return null;
    const audio = await fetchAudioBase64(preview.previewUrl);
    if (!audio) return null;
    const facts = await analyzePreviewAudio(audio, title, artist);
    if (!facts || (!facts.genre && !facts.vocal && !facts.instruments && !facts.production && !facts.lyrics)) return null;
    return JSON.stringify({ _source: 'iTunes 真实预览', ...facts }, null, 2);
  } catch (e) {
    console.error('[ai] 真实音源增强失败，回退纯文本:', e && e.message);
    return null;
  }
}

// ── 真实歌词来源（TME 原生优先）─────────────────────────────────────
// QQ 音乐（TME）优先，网易云（自建 API / weapi）回退。
// 网易云桥接给到精确 id 时，优先走网易云 id 直取（零搜索、最准、最省）。

// QQ 音乐：按「歌名 歌手」搜索 → 取歌词 → 解析 LRC
async function qqMusicLyrics(title, artist) {
  try {
    const s = await qqSearchSong(title, artist);
    if (!s || !s.mid) return [];
    const lrc = await qqGetLyric(s.mid);
    return parseLrc(lrc);
  } catch (e) {
    return [];
  }
}

// 网易云：优先自建 NetEaseCloudMusicApi（config.json 的 netEaseApiBaseUrl），回退直连 weapi
async function netEaseLyrics(ncmId, title, artist, cfg) {
  const base = (cfg.netEaseApiBaseUrl || '').replace(/\/+$/, '');
  if (base) {
    try {
      let id = ncmId;
      if (!id) {
        const s = await (await fetch(`${base}/cloudsearch?keywords=${encodeURIComponent(`${title} ${artist || ''}`.trim())}&type=1&limit=1`, { signal: AbortSignal.timeout(8000) })).json();
        id = s && s.result && s.result.songs && s.result.songs[0] && s.result.songs[0].id;
      }
      if (id) {
        const r = await (await fetch(`${base}/lyric?id=${id}`, { signal: AbortSignal.timeout(8000) })).json();
        const lrc = r && r.lrc && r.lrc.lyric;
        if (lrc) return parseLrc(lrc);
      }
    } catch (e) { /* 自建 API 失败，回退直连 weapi */ }
  }
  // 回退：直连网易云 weapi（部分网络会被网易云静默丢弃，返回空）
  try {
    let id = ncmId;
    if (!id) {
      const s = await searchSong(title, artist);
      if (!s) return [];
      id = s.id;
    }
    const lrc = await getLyric(id);
    return parseLrc(lrc);
  } catch (e) {
    return [];
  }
}

async function getRealLyrics(ncmId, title, artist) {
  const cfg = loadConfig();
  // 1) 网易云桥接精确 id：直取（最快最准），失败再走通用路径
  if (ncmId) {
    const viaId = await netEaseLyrics(ncmId, title, artist, cfg);
    if (viaId && viaId.length) return viaId;
  }
  // 2) TME 原生：QQ 音乐搜歌词（中文歌命中率高、时间戳准）
  if (cfg.qqMusicEnabled !== false && cfg.qqMusicEnabled !== 'false' && cfg.qqMusicEnabled !== '0') {
    const viaQQ = await qqMusicLyrics(title, artist);
    if (viaQQ && viaQQ.length) return viaQQ;
  }
  // 3) 回退：网易云按歌名搜索
  return await netEaseLyrics(null, title, artist, cfg);
}

async function getOrGenerateSongScript(title, artist, durationSec, model, fast, ncmId) {
  // 缓存键用「歌名 + 歌手」，避免同名歌（翻唱/现场/remix）命中错误缓存；
  // 同时兼容旧版「仅歌名」的缓存文件，避免历史缓存全部失效。
  const key = cacheKey(title, artist);
  const legacyKey = normalizeTitle(title);
  const names = key === legacyKey ? [key] : [key, legacyKey];
  // 先查听众库，再查创作库（同一首歌可能被创作者上传过）
  for (const dir of [LISTENER_DIR, CREATOR_DIR]) {
    for (const name of names) {
      const cachePath = path.join(dir, name + '.json');
      if (fs.existsSync(cachePath)) {
        try {
          return { script: JSON.parse(fs.readFileSync(cachePath, 'utf8')), fresh: false, usage: null };
        } catch (e) {
          /* 缓存损坏则重新生成 */
        }
      }
    }
  }
  const cfg = getConfig();
  const needKey = fast ? cfg.creatorApiKey : cfg.deepseekApiKey;
  if (!needKey) {
    // 未配置 Key：返回诚实标注的演示注脚，而不是静默失败/空弹
    console.warn('[ai] 未配置 API Key，返回演示注脚（请在 config.json 或环境变量中配置）');
    return { script: buildFallbackScript(title, artist, durationSec), fresh: true, usage: null };
  }
  // 真实数据打底：真实音源（iTunes 30s 预览，中文歌常搜不到）+ 真实歌词（自建 API / weapi）
  const enrichEnabled = cfg.enrichAudioEnabled !== false && cfg.enrichAudioEnabled !== 'false' && cfg.enrichAudioEnabled !== '0';
  const audioFacts = enrichEnabled ? await enrichWithRealAudio(title, artist) : null;
  const lyricLines = await getRealLyrics(ncmId, title, artist);
  const lyricsFacts = formatLyricsFacts(lyricLines);
  const { script, usage } = fast
    ? await generateSongScriptFast(title, artist, durationSec, audioFacts, lyricsFacts)
    : await generateSongScript(title, artist, durationSec, model, audioFacts, lyricsFacts);
  // 用真实歌词时间戳钉住注脚时间点（听众模式时间点不再靠 AI 猜秒数）
  const timed = snapHighlightsToRealTimes(script, lyricLines, durationSec);
  const full = { title, artist, mode: 'listener', timed, ...script };
  fs.mkdirSync(LISTENER_DIR, { recursive: true });
  fs.writeFileSync(path.join(LISTENER_DIR, key + '.json'), JSON.stringify(full, null, 2), 'utf8');
  return { script: full, fresh: true, usage: usage || null };
}

// 只读缓存：按歌名取已生成的剧本（列表 → 点歌看解析用），不触发生成。
// 缓存 key 已含歌手，这里按「规范化歌名」扫描匹配（标题即可定位，兼容旧缓存）。
function getCachedScript(title) {
  const t = normalizeTitle(title);
  if (!t) return null;
  for (const dir of [LISTENER_DIR, CREATOR_DIR]) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          if (d && normalizeTitle(d.title) === t) return d;
        } catch (e) {
          /* 跳过损坏缓存 */
        }
      }
    } catch (e) {
      /* 目录不存在则继续 */
    }
  }
  return null;
}

// 视觉识别歌单截图 → [{ title, artist }]
async function parsePlaylistScreenshot(imageBase64, mime) {
  // 截图识别走 Gemini（多模态视觉），DeepSeek 无视觉能力
  const cfg = loadConfig();
  const { content } = await geminiGenerateContent({
    model: cfg.creatorAudioModel || 'gemini-3.5-flash',
    text: '这是一个音乐播放器歌单的截图。请识别出里面所有的歌曲，每首歌给出「歌名」和「歌手」。只输出一个 JSON 数组，不要输出任何其它文字，格式：[{"title":"歌名","artist":"歌手"}]',
    inlineData: { mime: mime || 'image/png', base64: imageBase64 },
    jsonMode: true,
    maxTokens: 6000,
  });
  const arr = JSON.parse(stripJsonFence(content || '[]'));
  return Array.isArray(arr) ? arr : [];
}

// 批量预生成（并行 + 进度回调）
async function batchGenerateSongs(songs, onProgress) {
  // 去重：同一首歌（按规范化歌名）只生成一次
  const seen = new Set();
  const unique = [];
  for (const s of songs || []) {
    const k = cacheKey(s && s.title, s && s.artist);
    if (k && !seen.has(k)) {
      seen.add(k);
      unique.push(s);
    }
  }
  songs = unique;
  const total = songs.length;
  let done = 0;
  const queue = songs.slice();
  const CONCURRENCY = 5;
  const results = [];

  async function worker() {
    while (queue.length) {
      const song = queue.shift();
      if (!song || !song.title) continue;
      try {
        // 批量文本生成走 DeepSeek（内容准、结构对）；用 flash 更快，Gemini 仅用于多模态
        const r = await getOrGenerateSongScript(song.title, song.artist || '', song.duration || 0, 'deepseek-flash', false);
        results.push({ ...song, ok: true, usage: r && r.fresh ? r.usage : null });
      } catch (e) {
        results.push({ ...song, ok: false, error: e.message });
      }
      done++;
      if (onProgress) onProgress({ done, total, title: song.title });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, total)) }, () => worker()));
  return results;
}

// 创作者：现场听音频，生成「唱·词·曲·编」导览剧本
const AUDIO_PROMPT = [
  '你是一位专业的音乐制作分析。请「听」这段音频（这是一首歌曲），找出里面「有意思、值得注脚」的时刻，从「唱、词、曲、编」四个角度分析。',
  '',
  '要求：',
  '1. 给 10-15 个注脚点，时间点分布全曲（以秒为单位）；',
  '2. 每个点：time(秒) + core(一句话点出最核心最出彩的地方) + 唱(演唱/人声) + 词(歌词) + 曲(旋律) + 编(编曲)，每个维度 2-4 句，写明音色、手法、乐器、混音/编曲细节、处理意图与效果；',
  '3. 语言要「专业」：面向音乐创作者/从业者，直接使用准确的制作术语与技法表述，保持专业密度，不要用大白话降级；',
  '4. 专业术语用 [[术语]] 括起来（便于前端做成可点击搜索），例如「[[混响]]」「[[侧链压缩]]」，但不必在同句里用大白话解释；',
  '5. 客观讲事实与创作意图，不做情绪化评判。',
  '6. 全部内容（summary、core、唱/词/曲/编）一律用中文输出，禁止使用英文。',
  '',
  '只输出 JSON（不要输出其它文字）：',
  '{"summary":"一句话","highlights":[{"time":秒,"core":"...","唱":"...","词":"...","曲":"...","编":"..."}]}',
].join('\n');

async function analyzeAudio(audioBase64, format, title, artist) {
  const cfg = loadConfig();
  const model = cfg.creatorAudioModel || 'gemini-3.5-flash';
  if (!cfg.creatorApiKey) throw new Error('缺少 Gemini API Key（config.json 的 creatorApiKey）');
  const mime = guessMime(format);

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { content, usage } = await geminiGenerateContent({
        model,
        text: AUDIO_PROMPT,
        inlineData: { mime, base64: audioBase64 },
        jsonMode: true,
        maxTokens: 24000,
        timeoutMs: 120000,
      });
      const script = JSON.parse(stripJsonFence(content || '{}'));
      if (Array.isArray(script.highlights)) {
        // 前端按升序时间找注脚点，AI 返回顺序不保证，这里排好再缓存
        script.highlights.sort((a, b) => (a.time || 0) - (b.time || 0));
      }
      const full = { title, artist, mode: 'creator', _usage: usage || null, ...script };
      const key = cacheKey(title, artist);
      fs.mkdirSync(CREATOR_DIR, { recursive: true });
      fs.writeFileSync(path.join(CREATOR_DIR, key + '.json'), JSON.stringify(full, null, 2), 'utf8');
      return full;
    } catch (e) {
      lastErr = e;
      // 上游过载 / 瞬时错误时重试一次
      const msg = String((e && e.message) || e);
      if (/429|5\d\d|overloaded|timeout|aborted/i.test(msg) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw lastErr || new Error('音频分析失败');
}

module.exports = {
  generateSongScript,
  getOrGenerateSongScript,
  getRealLyrics,
  getCachedScript,
  normalizeTitle,
  normalizeArtist,
  cacheKey,
  parsePlaylistScreenshot,
  batchGenerateSongs,
  analyzeAudio,
};
