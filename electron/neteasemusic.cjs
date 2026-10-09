// 网易云音乐 weapi 客户端（自包含，无外部依赖）
// 用官方 weapi 加密（AES-128-CBC 两段 + RSA 裸加密）调用 music.163.com 的接口，
// 拿「真实歌词」给 AI 打底，避免听众模式对中文歌凭空编造。
const crypto = require('crypto');

const AES_KEY = '0CoJUm6Qyw8W8jud';
const AES_IV = '0102030405060708';
const RSA_EXPONENT = '010001';
const RSA_MODULUS =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function aesEncrypt(text, key, iv) {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(key, 'utf8'),
    Buffer.from(iv, 'utf8'),
  );
  return Buffer.concat([cipher.update(Buffer.from(text, 'utf8')), cipher.final()]).toString('base64');
}

let _publicKey = null;
function rsaEncrypt(text) {
  if (!_publicKey) {
    const modulus = Buffer.from(RSA_MODULUS, 'hex'); // 128 字节（1024 位）
    const exponent = Buffer.from(RSA_EXPONENT, 'hex'); // 3 字节
    _publicKey = crypto.createPublicKey({
      key: { kty: 'RSA', n: modulus.toString('base64url'), e: exponent.toString('base64url') },
      format: 'jwk',
    });
  }
  const reversed = Buffer.from(String(text).split('').reverse().join(''), 'utf8');
  const padded = Buffer.alloc(128);
  reversed.copy(padded, 128 - reversed.length);
  const enc = crypto.publicEncrypt({ key: _publicKey, padding: crypto.constants.RSA_NO_PADDING }, padded);
  return enc.toString('hex').padStart(256, '0');
}

function weapi(object) {
  const text = JSON.stringify(object);
  let randomKey = '';
  for (let i = 0; i < 16; i++) randomKey += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  const params = aesEncrypt(aesEncrypt(text, AES_KEY, AES_IV), randomKey, AES_IV);
  const encSecKey = rsaEncrypt(randomKey);
  return { params, encSecKey };
}

async function weapiPost(url, object) {
  const { params, encSecKey } = weapi(object);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ params, encSecKey }).toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error('网易云 API HTTP ' + res.status);
  return await res.json();
}

// 搜索歌曲 → 第一首匹配的 { id, name, artist }
async function searchSong(title, artist) {
  const q = `${title} ${artist || ''}`.trim();
  const data = await weapiPost('https://music.163.com/weapi/cloudsearch/get/web', {
    s: q, type: 1, limit: 5, offset: 0, total: true,
  });
  const songs = data && data.result && data.result.songs;
  if (!songs || !songs.length) return null;
  const s = songs[0];
  return { id: s.id, name: s.name, artist: (s.ar || []).map((a) => a.name).join('/') };
}

// 获取歌词（LRC 原文，含时间戳）
async function getLyric(id) {
  const data = await weapiPost('https://music.163.com/weapi/song/lyric', {
    id, lv: -1, kv: -1, tv: -1,
  });
  return (data && data.lrc && data.lrc.lyric) || null;
}

// 解析 LRC → [{ time: 秒, text }]（升序）。
// LRC 顶部常有一段「制作信息」署名（词：xxx / 曲：xxx / 编曲：xxx / 录音工程：xxx …），
// 它们不是歌词，却带着 0~15s 的时间戳，会污染注脚时间点锚定、误导 AI。
// 规则：进入正歌词之前，凡带冒号（：/:）的行、以及「歌名 - 歌手」标题行都跳过；进入正文后不再过滤。
function parseLrc(lrc) {
  const out = [];
  if (!lrc) return out;
  let inBody = false; // 是否已进入正歌词
  for (const line of String(lrc).split('\n')) {
    const m = line.match(/^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (!m) continue;
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    const frac = m[3] ? parseInt((m[3] + '00').slice(0, 3), 10) / 1000 : 0;
    const text = (m[4] || '').trim();
    if (!text) continue;
    if (!inBody) {
      if (/[：:]/.test(text)) continue; // 署名/信息行（带冒号）
      if (/ - /.test(text)) continue; // 首行「歌名 - 歌手」标题
      inBody = true; // 第一行非署名、非标题 → 进入正歌词
    }
    out.push({ time: min * 60 + sec + frac, text });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

module.exports = { weapi, searchSong, getLyric, parseLrc };
