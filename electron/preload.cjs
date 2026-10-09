const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 订阅“当前活跃来源”（内置播放器或外部播放器），返回取消订阅函数
  onSource: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('source', handler);
    return () => ipcRenderer.removeListener('source', handler);
  },
  // 主窗口：推送内置播放器状态
  sendBuiltinSource: (data) => ipcRenderer.send('builtin-source', data),
  // 悬浮球窗口：切换自身尺寸（idle=仅光点 / card=含气泡卡片）
  resizeBall: (mode, height) => ipcRenderer.send('ball-resize', { mode, height }),
  moveBall: (dx, dy) => ipcRenderer.send('ball-move', { dx, dy }),
  searchTerm: (term) => ipcRenderer.send('search-term', term),
  quitApp: () => ipcRenderer.send('quit-app'),
  // 右键悬浮球：弹出「暂停注脚 / 屏蔽当前曲 / 退出」菜单
  showBallMenu: () => ipcRenderer.send('ball-menu'),
  onBallState: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('ball-state', handler);
    return () => ipcRenderer.removeListener('ball-state', handler);
  },
  // 主窗口：查询当前 SMTC 与内置来源
  getSources: () => ipcRenderer.invoke('get-active-source'),
  // 主窗口：订阅外部播放器状态（SMTC 或窗口标题识别）
  onExternalStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('external-status', handler);
    return () => ipcRenderer.removeListener('external-status', handler);
  },
  // 悬浮球窗口：订阅 AI 导览剧本（{ key, script }）
  onScript: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('script', handler);
    return () => ipcRenderer.removeListener('script', handler);
  },
  // 歌单导入相关
  parseScreenshot: (imageBase64, mime) => ipcRenderer.invoke('parse-screenshot', { imageBase64, mime }),
  batchGenerate: (songs) => ipcRenderer.send('batch-generate', songs),
  onBatchProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('batch-progress', h);
    return () => ipcRenderer.removeListener('batch-progress', h);
  },
  onBatchDone: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('batch-done', h);
    return () => ipcRenderer.removeListener('batch-done', h);
  },
  listCachedSongs: () => ipcRenderer.invoke('list-cached-songs'),
  getCachedScript: (title) => ipcRenderer.invoke('get-cached-script', title),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  analyzeAudio: (base64, format, title, artist) => ipcRenderer.invoke('analyze-audio', { base64, format, title, artist }),
  setTheme: (palette) => ipcRenderer.send('set-theme', palette),
  onTheme: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('theme', handler);
    return () => ipcRenderer.removeListener('theme', handler);
  },
  onFullscreen: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('fullscreen', handler);
    return () => ipcRenderer.removeListener('fullscreen', handler);
  },
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  getSearchHistory: () => ipcRenderer.invoke('get-search-history'),
  // 网易云「零延迟」接入：状态查询 / 一键安装桥接插件 / 打开下载页 / 状态订阅
  getNcmStatus: () => ipcRenderer.invoke('get-ncm-status'),
  installNcmPlugin: () => ipcRenderer.invoke('install-ncm-plugin'),
  openNcmDownload: () => ipcRenderer.send('open-ncm-download'),
  openInflinkDownload: () => ipcRenderer.send('open-inflink-download'),
  onNcmStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('ncm-status', handler);
    return () => ipcRenderer.removeListener('ncm-status', handler);
  },
});
