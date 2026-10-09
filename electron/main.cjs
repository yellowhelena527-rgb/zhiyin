const { app, BrowserWindow, Menu, screen, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { createNowPlayingPoller } = require('./nowplaying.cjs');
const { getOrGenerateSongScript, getCachedScript, cacheKey, parsePlaylistScreenshot, batchGenerateSongs, analyzeAudio } = require('./ai.cjs');
const { getConfig, searchHistoryPath, cacheDir, listenerDir, creatorDir } = require('./paths.cjs');

// 网易云「零延迟」桥接：本地 WebSocket 服务端口（与 ncm-plugin/main.js 保持一致）
const NCM_BRIDGE_PORT = Number(getConfig().ncmBridgePort) || 4755;
const BETTER_NCM_DIR = 'C:\\betterncm';

// 检测 BetterNCM / InfLink-rs / 知音桥接插件是否已安装（读磁盘，不触发任何改动）
function detectNcmInstall() {
  const pluginsDir = path.join(BETTER_NCM_DIR, 'plugins');
  const runtimeDir = path.join(BETTER_NCM_DIR, 'plugins_runtime');
  const betterNcmInstalled = fs.existsSync(BETTER_NCM_DIR);
  let inflinkInstalled = false;
  let pluginInstalled = false;
  // 插件可能是 plugins/ 下的 .plugin 压缩包，也可能是 plugins_runtime/ 下已解压的文件夹
  if (fs.existsSync(pluginsDir)) {
    try {
      const files = fs.readdirSync(pluginsDir);
      inflinkInstalled = files.some((f) => f.toLowerCase().includes('inflink'));
      pluginInstalled = files.some((f) => f.toLowerCase().includes('zhiyin-bridge'));
    } catch (e) { /* 忽略 */ }
  }
  if (fs.existsSync(runtimeDir)) {
    try {
      const dirs = fs.readdirSync(runtimeDir);
      inflinkInstalled = inflinkInstalled || dirs.some((d) => d.toLowerCase().includes('inflink'));
      pluginInstalled = pluginInstalled || dirs.some((d) => d.toLowerCase() === 'zhiyin-bridge');
    } catch (e) { /* 忽略 */ }
  }
  return { betterNcmInstalled, inflinkInstalled, pluginInstalled };
}

// 桥接插件源目录：打包后从 extraResources 读（resources/ncm-plugin），开发时从仓库读
function ncmPluginSourceDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'ncm-plugin');
  return path.join(__dirname, '..', 'ncm-plugin');
}

process.on('uncaughtException', (err) => {
  console.error('[FATAL]', err && err.message, '\n', err && err.stack);
});

// 搜索历史（音乐名词）：点击术语搜索时记录，供主窗口 REVIEW 展示
const SEARCH_HISTORY_PATH = searchHistoryPath();
let searchHistory = [];
try {
  searchHistory = JSON.parse(fs.readFileSync(SEARCH_HISTORY_PATH, 'utf8')) || [];
} catch (e) {
  searchHistory = [];
}
function saveSearchHistory() {
  try {
    fs.mkdirSync(path.dirname(SEARCH_HISTORY_PATH), { recursive: true });
    fs.writeFileSync(SEARCH_HISTORY_PATH, JSON.stringify(searchHistory), 'utf8');
  } catch (e) {}
}

const DEV_URL = process.env.VITE_DEV_SERVER_URL || null;
const MARGIN = 16;

// 非音乐类 SMTC 来源（浏览器/视频平台/问答等）。识别到就直接忽略，
// 避免把视频、文章、网页音频当成歌曲去生成注脚（「内容完全不对」的主要根因）。
const NON_MUSIC_APP_KEYWORDS = [
  // 浏览器（含 WebView 套壳）
  'chrome', 'msedge', 'microsoft edge', 'firefox', 'opera', 'brave', 'vivaldi', 'iexplore', 'safari',
  'webview', 'webview2', 'electron',
  // 视频 / 短视频 / 直播
  'bilibili', 'youku', 'iqiyi', 'qqvideo', 'tencent video', 'mgtv', 'acfun', 'douyin', 'tiktok', 'kuaishou',
  'potplayer', 'vlc', 'mpc', 'microsoft.media', 'photos', 'movies', 'movies & tv',
  // 问答 / 阅读 / 播客 / 语音
  'zhihu', 'weixin', 'wechat', 'dingtalk', 'feishu', 'lark', 'teams', 'skype', 'discord', 'slack',
  'audible', 'podcast', '喜马拉雅', 'ximalaya', '得到', 'deyun',
];

let mainWindow = null;
let ballWindow = null;
let nowplaying = null;

let builtinSource = null; // { channel:'builtin', title, artist, isPlaying, positionSec }
let externalSource = null; // { channel:'smtc'|'window', title, artist, isPlaying, positionSec, duration }
let currentSongKey = null;
let windowSongKey = null;
let windowSongStartedAt = 0;
let ballMode = 'idle'; // 'idle' | 'card'
let ballHeight = 72;
let userMovedBall = false; // 用户拖拽过小球后，不再自动吸回角落
let lastIgnoredAppId = null; // 去重：已忽略的非音乐来源，避免日志刷屏
let paused = false; // 暂停注脚：不再自动生成/推送新剧本（右键悬浮球切换）
let skippedKey = null; // 屏蔽当前曲：本首不再自动弹注脚
let pendingSongKey = null; // 换歌后的「稳定确认」：新歌先等一小段时间再生成，避免误认视频/广告
let pendingSince = 0;
const GENERATE_SETTLE_MS = 1200; // 新歌需稳定这么久才触发生成

let ncmSource = null; // { channel:'ncm-local', title, artist, isPlaying, positionSec, duration }
let ncmConnected = false; // 是否有网易云桥接插件已连接
let ncmClient = null;

function ncmStatus() {
  const det = detectNcmInstall();
  return { connected: ncmConnected, port: NCM_BRIDGE_PORT, ...det };
}

function loadEntry(win, entry) {
  if (DEV_URL) {
    win.loadURL(`${DEV_URL}/${entry}`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'out', entry));
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 640,
    height: 860,
    minWidth: 460,
    minHeight: 640,
    backgroundColor: '#0a0a0f',
    title: '知音',
    icon: path.join(__dirname, '..', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadEntry(mainWindow, 'index.html');
  mainWindow.on('closed', () => {
    mainWindow = null;
    // 关闭主窗口时，连同悬浮球一起退出整个应用
    app.quit();
  });
}

// 悬浮球窗口始终锚定屏幕右下角（workArea 已排除任务栏）
// 球初始位置：按 eazo 设计的位置（水平居中、贴近底部）
function ballBounds(mode, height) {
  // 初始定位到光标所在屏（多显示器友好），而非总是主屏
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const size = { width: 72, height: 72 };
  return {
    x: Math.round(workArea.x + (workArea.width - size.width) / 2),
    y: Math.round(workArea.y + workArea.height - size.height - Math.max(28, workArea.height * 0.06)),
    width: size.width,
    height: size.height,
  };
}

// 尺寸切换（idle ↔ card）：保持窗口底部中心不动，瞬时缩放（透明窗动画会抖，故用瞬时）
function applyBallBounds(mode, height) {
  if (!ballWindow || ballWindow.isDestroyed()) return;
  const b = ballWindow.getBounds();
  const centerX = b.x + b.width / 2;
  const bottom = b.y + b.height;
  const size = mode === 'card' ? { width: 600, height: height || 420 } : { width: 72, height: 72 };
  ballWindow.setBounds(
    { x: Math.round(centerX - size.width / 2), y: bottom - size.height, width: size.width, height: size.height },
    false
  );
}

function createBallWindow() {
  const b = ballBounds('idle');
  ballWindow = new BrowserWindow({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  ballWindow.setAlwaysOnTop(true, 'screen-saver');
  loadEntry(ballWindow, 'ball.html');
  // 默认点击穿透，只有悬浮球/气泡上才响应鼠标，避免挡住主窗口标题栏
  ballWindow.setIgnoreMouseEvents(true, { forward: true });
  ballWindow.on('closed', () => {
    ballWindow = null;
  });
}

// 决定“当前活跃来源”：网易云桥接(实时) > 内置在播 > 外部在播 > 各暂停 > none
function activeSource() {
  if (ncmSource && ncmSource.isPlaying) return ncmSource;
  if (builtinSource && builtinSource.isPlaying) return builtinSource;
  if (externalSource && externalSource.isPlaying) return externalSource;
  if (ncmSource) return ncmSource;
  if (builtinSource) return builtinSource;
  if (externalSource) return externalSource;
  return { channel: 'none' };
}

function broadcastSource() {
  const src = activeSource();
  // SMTC 源用「写入时刻」做外推锚点（其余通道用接收时刻），渲染层按 at 外推实时进度
  const anchorAt =
    src.channel === 'smtc' && src.positionAt > 0 && src.positionAt <= Date.now()
      ? src.positionAt
      : Date.now();
  const payload = { ...src, at: anchorAt };
  if (ballWindow && !ballWindow.isDestroyed()) {
    ballWindow.webContents.send('source', payload);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('source', payload);
  }
  maybeGenerateScript(src);
}

// 当活跃来源是某首歌时，确保其导览剧本已生成（带缓存），生成后发给悬浮球
function maybeGenerateScript(src) {
  if (!src || !src.title || src.channel === 'none') {
    pendingSongKey = null;
    return;
  }
  const key = src.title + ' - ' + src.artist;
  if (key === currentSongKey) {
    pendingSongKey = null;
    return;
  }
  // 稳定确认：新歌先稳定 GENERATE_SETTLE_MS 再生成，避免把视频/广告误当歌曲
  const now = Date.now();
  if (key !== pendingSongKey) {
    pendingSongKey = key;
    pendingSince = now;
    return;
  }
  if (now - pendingSince < GENERATE_SETTLE_MS) return;
  pendingSongKey = null;
  currentSongKey = key;
  // 换歌后清除上一首的「屏蔽」标记
  if (skippedKey && skippedKey !== key) skippedKey = null;
  // 暂停 / 屏蔽当前曲：不生成
  if (paused || key === skippedKey) return;
  const duration = src.duration && src.duration > 0 ? src.duration : 240;
  getOrGenerateSongScript(src.title, src.artist, duration, null, false, src.ncmId)
    .then(({ script }) => {
      if (ballWindow && !ballWindow.isDestroyed()) {
        ballWindow.webContents.send('script', { key, script });
      }
    })
    .catch((e) => {
      console.error('[ai] 剧本生成失败:', e.message);
    });
}

function setPaused(v) {
  paused = !!v;
  if (ballWindow && !ballWindow.isDestroyed()) {
    ballWindow.webContents.send('ball-state', { paused });
  }
}

app.whenReady().then(() => {
  createMainWindow();
  createBallWindow();

  // 音频可视化：允许渲染进程捕获系统音频输出（WASAPI loopback，仅音频不抓屏）
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ audio: 'loopback' });
  });

  // 主窗口最大化 / 真全屏 → 通知悬浮球弹框；还原 → 收起
  const notifyFullscreen = (v) => {
    if (ballWindow && !ballWindow.isDestroyed()) ballWindow.webContents.send('fullscreen', v);
  };
  mainWindow.on('maximize', () => notifyFullscreen(true));
  mainWindow.on('unmaximize', () => notifyFullscreen(false));
  mainWindow.on('enter-full-screen', () => notifyFullscreen(true));
  mainWindow.on('leave-full-screen', () => notifyFullscreen(false));

  // 外部播放器监听（SMTC + 窗口标题）
  nowplaying = createNowPlayingPoller({
    onChange: (data) => {
      if (data && data.active && data.channel === 'window') {
        // 窗口标题通道（网易云）：估算进度 —— 从切歌那一刻开始计时
        const key = (data.title || '') + ' - ' + (data.artist || '');
        if (key !== windowSongKey) {
          windowSongKey = key;
          windowSongStartedAt = Date.now();
        }
        externalSource = {
          channel: 'window',
          title: data.title || '',
          artist: data.artist || '',
          isPlaying: true,
          positionSec: (Date.now() - windowSongStartedAt) / 1000,
          duration: 0,
        };
      } else {
        windowSongKey = null;
        if (data && data.active) {
          // SMTC：过滤浏览器/视频/问答等非音乐来源，避免生成错误注脚
          const appId = String(data.appId || '').toLowerCase();
          const isNonMusic = NON_MUSIC_APP_KEYWORDS.some((k) => appId.includes(k));
          if (isNonMusic) {
            if (lastIgnoredAppId !== appId) {
              lastIgnoredAppId = appId;
              console.log('[nowplaying] 忽略非音乐来源:', appId || '(空)', '—', data.title);
            }
            externalSource = null;
          } else {
            externalSource = {
              channel: 'smtc',
              title: data.title || '',
              artist: data.artist || '',
              isPlaying: !!data.isPlaying,
              positionSec: data.position || 0,
              duration: data.duration || 0,
              // SMTC 的「写入时刻」（LastUpdatedTime，epoch ms）：用它当外推锚点，
              // 消除位置在系统管线里缓冲 ~1-2 秒造成的进度滞后。
              positionAt: data.lastUpdated || 0,
            };
          }
        } else {
          externalSource = null;
        }
      }
      broadcastSource();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('external-status', externalSource);
      }
    },
  });
  nowplaying.start();

  // 网易云实时桥接：本地 WebSocket 服务，接收 ncm-plugin 推送的实时进度
  try {
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ port: NCM_BRIDGE_PORT });
    wss.on('connection', (socket) => {
      ncmClient = socket;
      ncmConnected = true;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ncm-status', ncmStatus());
      }
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg && msg.type === 'state') {
            const title = String(msg.title || '').trim();
            const artist = String(msg.artist || '').trim();
            const isPlaying = !!msg.isPlaying;
            if (title) {
              ncmSource = {
                channel: 'ncm-local',
                title,
                artist,
                isPlaying,
                positionSec: (Number(msg.positionMs) || 0) / 1000,
                duration: (Number(msg.durationMs) || 0) / 1000,
                ncmId: msg.ncmId || null,
              };
              broadcastSource();
            } else if (!isPlaying) {
              // 无歌（暂停/未加载）：清空来源
              ncmSource = null;
              broadcastSource();
            }
          }
        } catch (e) { /* 忽略脏消息 */ }
      });
      socket.on('close', () => {
        if (ncmClient === socket) ncmClient = null;
        ncmConnected = false;
        ncmSource = null;
        broadcastSource();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ncm-status', ncmStatus());
        }
      });
      socket.on('error', () => {});
    });
    wss.on('error', (err) => {
      console.error('[ncm] WebSocket 服务启动失败:', err && err.message);
    });
  } catch (e) {
    console.error('[ncm] ws 依赖不可用（请先 npm install）:', e && e.message);
  }

  // 内置播放器来源（主窗口推送）
  ipcMain.on('builtin-source', (_e, data) => {
    builtinSource = {
      channel: 'builtin',
      title: data.title || '',
      artist: data.artist || '',
      isPlaying: !!data.isPlaying,
      positionSec: data.positionSec || 0,
      duration: data.duration || 0,
    };
    broadcastSource();
  });

  // 悬浮球窗口尺寸切换
  ipcMain.on('ball-resize', (_e, payload) => {
    const mode = (typeof payload === 'string' ? payload : payload && payload.mode) === 'card' ? 'card' : 'idle';
    const height = payload && payload.height;
    applyBallBounds(mode, height);
  });

  // 悬浮球窗口拖动
  ipcMain.on('ball-move', (_e, delta) => {
    if (!ballWindow) return;
    userMovedBall = true; // 拖拽过就不再自动吸回右下角
    const [x, y] = ballWindow.getPosition();
    ballWindow.setPosition(Math.round(x + (delta.dx || 0)), Math.round(y + (delta.dy || 0)));
  });

  // 专业术语跳转浏览器搜索 + 记录历史
  ipcMain.on('search-term', (_e, term) => {
    if (!term) return;
    searchHistory = [term, ...searchHistory.filter((t) => t !== term)].slice(0, 50);
    saveSearchHistory();
    shell.openExternal('https://www.baidu.com/s?wd=' + encodeURIComponent('音乐用语 ' + term));
  });

  // 主窗口 REVIEW：读取搜索历史
  ipcMain.handle('get-search-history', () => searchHistory);

  // 主题色同步：主窗口改色 → 广播给悬浮球窗口
  ipcMain.on('set-theme', (_e, palette) => {
    if (ballWindow && !ballWindow.isDestroyed()) {
      ballWindow.webContents.send('theme', palette);
    }
  });

  // 悬浮球窗口点击穿透开关（鼠标在球/气泡上时关闭穿透）
  ipcMain.on('set-ignore-mouse', (_e, ignore) => {
    if (ballWindow && !ballWindow.isDestroyed()) {
      ballWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
    }
  });

  // 应用失焦（不在最上方）时，小球自动跳回屏幕右下角，贴住右缘（不藏出屏）
  function moveBallToCorner() {
    if (userMovedBall) return; // 用户拖拽过后不再自动吸回
    if (!ballWindow || ballWindow.isDestroyed()) return;
    const b = ballWindow.getBounds();
    // 吸附到球当前所在显示器（多显示器友好），而非总是主屏
    const { workArea } = screen.getDisplayMatching(b);
    const margin = 16;
    const extraRight = 0; // 完全贴边不藏（想藏一条边就改大，如 0.5*37.795≈19px）
    const targetX = Math.round(workArea.x + workArea.width - b.width - margin + extraRight);
    const targetY = Math.round(workArea.y + workArea.height - b.height - margin);
    const dx = targetX - b.x;
    const dy = targetY - b.y;
    if (dx === 0 && dy === 0) return;
    const duration = 900;
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (!ballWindow || ballWindow.isDestroyed()) {
        clearInterval(iv);
        return;
      }
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3); // ease-out 缓动
      ballWindow.setBounds({
        x: Math.round(b.x + dx * e),
        y: Math.round(b.y + dy * e),
        width: b.width,
        height: b.height,
      });
      if (p >= 1) clearInterval(iv);
    }, 16);
  }

  // 任一窗口失焦时，若整个应用（含悬浮球）都不在前台，则收起小球到右下角
  app.on('browser-window-blur', () => {
    setTimeout(() => {
      const anyFocused = BrowserWindow.getAllWindows().some((w) => w.isFocused());
      if (!anyFocused) moveBallToCorner();
    }, 150);
  });

  // 退出应用（右键悬浮球）
  ipcMain.on('quit-app', () => app.quit());

  // 右键悬浮球：弹出「暂停注脚 / 屏蔽当前曲 / 退出」菜单
  ipcMain.on('ball-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: paused ? '恢复注脚' : '暂停注脚', click: () => setPaused(!paused) },
      {
        label: '屏蔽当前歌曲',
        enabled: !!currentSongKey && currentSongKey !== skippedKey,
        click: () => { skippedKey = currentSongKey; },
      },
      { type: 'separator' },
      { label: '退出知音', click: () => app.quit() },
    ]);
    menu.popup({ window: ballWindow || undefined });
  });

  // 主窗口查询来源状态
  ipcMain.handle('get-active-source', () => ({ external: externalSource, builtin: builtinSource }));

  // 网易云接入：状态查询 / 一键安装桥接插件 / 打开下载页
  ipcMain.handle('get-ncm-status', () => ncmStatus());
  ipcMain.handle('install-ncm-plugin', async () => {
    try {
      if (!fs.existsSync(BETTER_NCM_DIR)) {
        return { ok: false, error: '未检测到 BetterNCM（C:\\betterncm 不存在）' };
      }
      const srcDir = ncmPluginSourceDir();
      if (!fs.existsSync(srcDir)) {
        return { ok: false, error: '插件源文件缺失（ncm-plugin/ 目录不存在）' };
      }
      const pluginsDir = path.join(BETTER_NCM_DIR, 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });
      // BetterNCM 只认 .plugin 压缩包（本质是 zip），而 Compress-Archive 只支持 .zip 后缀 → 先打 .zip 再改名
      const tmpZip = path.join(pluginsDir, 'zhiyin-bridge.zip');
      const zipPath = path.join(pluginsDir, 'zhiyin-bridge.plugin');
      try { fs.rmSync(tmpZip, { force: true }); } catch (e) { /* 忽略 */ }
      try { fs.rmSync(zipPath, { force: true }); } catch (e) { /* 忽略 */ }
      const ps = `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${tmpZip}' -Force`;
      execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
      fs.renameSync(tmpZip, zipPath);
      return { ok: true, dest: zipPath };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });
  ipcMain.on('open-ncm-download', () => {
    shell.openExternal('https://github.com/BetterNCM/BetterNCM/releases');
  });
  ipcMain.on('open-inflink-download', () => {
    shell.openExternal('https://github.com/apoint123/inflink-rs/releases');
  });

  // 歌单截图识别
  ipcMain.handle('parse-screenshot', async (_e, payload) => {
    return await parsePlaylistScreenshot(payload.imageBase64, payload.mime);
  });

  // 批量预生成（进度通过事件上报）
  ipcMain.on('batch-generate', async (e, songs) => {
    try {
      const results = await batchGenerateSongs(songs, (p) => {
        if (!e.sender.isDestroyed()) e.sender.send('batch-progress', p);
      });
      if (!e.sender.isDestroyed()) e.sender.send('batch-done', results);
    } catch (err) {
      if (!e.sender.isDestroyed()) e.sender.send('batch-done', { error: err.message });
    }
  });

  // 列出已缓存歌曲（分听众库/创作库，各按「歌名 - 歌手」去重）
  ipcMain.handle('list-cached-songs', async () => {
    const readDir = (dir) => {
      const seen = new Set();
      const out = [];
      try {
        for (const f of fs.readdirSync(dir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
            if (!d || !d.title) continue;
            // 歌名 + 歌手去重：同名歌的不同版本都能列出
            const key = cacheKey(d.title, d.artist);
            if (key && !seen.has(key)) {
              seen.add(key);
              out.push({ title: d.title, artist: d.artist || '' });
            }
          } catch (e) {
            /* 跳过损坏/旧格式缓存 */
          }
        }
      } catch (e) {
        /* 目录不存在则返回空 */
      }
      return out;
    };
    return {
      listener: readDir(listenerDir()),
      creator: readDir(creatorDir()),
    };
  });

  // 清空全部缓存（听众库 + 创作库 + 搜索历史）
  ipcMain.handle('clear-cache', async () => {
    try {
      fs.rmSync(cacheDir(), { recursive: true, force: true });
      searchHistory = [];
      saveSearchHistory();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  });

  // 按歌名取单个已缓存剧本（列表 → 点歌看解析），不触发生成
  ipcMain.handle('get-cached-script', async (_e, title) => {
    return getCachedScript(title);
  });

  // 创作者：现场分析音频
  ipcMain.handle('analyze-audio', async (_e, payload) => {
    return await analyzeAudio(payload.base64, payload.format, payload.title, payload.artist);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createBallWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
