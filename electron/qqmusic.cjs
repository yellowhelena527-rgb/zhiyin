// QQ 音乐公开接口客户端（自包含，无外部依赖）
// 用 c.y.qq.com 的「搜索 + 歌词」接口拿真实歌词 LRC，作为 TME 平台的原生歌词源。
// 让知音在 QQ 音乐 / 酷狗 / 酷我等 TME 平台上「真实歌词钉时间点」走 TME 自己的数据，
// 不再依赖网易云（网易云降级为回退源）。
//
// 接口无需登录，只需带上 Referer 与 UA；任何一步失败都抛错，由调用方回退到网易云。

const HEADERS = {
  Referer: 'https://y.qq.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

// 歌词接口历史上会返回 JSONP（MusicJsonCallback({...})），统一剥壳成纯 JSON
function stripJsonp(text) {
  const m = /^[\s\S]*?\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/.exec(text);
  return m ? m[1] : text;
}

async function qqFetch(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('QQ音乐 API HTTP ' + res.status);
  return await res.text();
}

// 搜索歌曲 → 第一首匹配的 { mid, id, name, artist }
async function searchSong(title, artist) {
  const q = `${title} ${artist || ''}`.trim();
  const text = await qqFetch(
    `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(q)}&format=json&p=1&n=1`
  );
  const d = JSON.parse(text);
  const list = d && d.data && d.data.song && d.data.song.list;
  if (!list || !list.length) return null;
  const s = list[0];
  return {
    mid: s.songmid || '',
    id: s.songid,
    name: s.songname || '',
    artist: (s.singer || []).map((a) => a.name).join('/'),
  };
}

// 获取歌词（LRC 原文，含时间戳）。mid 为 songmid。
async function getLyric(mid) {
  const text = await qqFetch(
    `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(mid)}&format=json&nobase64=1&g_tk=5381`
  );
  const d = JSON.parse(stripJsonp(text));
  return (d && d.lyric) || null;
}

module.exports = { searchSong, getLyric };
