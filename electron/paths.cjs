// 共享的「配置 / 缓存」路径与读取逻辑。
// 解决打包后路径指进 app.asar 的问题：打包后数据写到 userData，config.json 从 userData / resourcesPath 读；
// 开发时保持原行为（读仓库根目录）。配置优先级：环境变量 > config.json 文件。
const path = require('path');
const fs = require('fs');

// require('electron') 在纯 Node 环境下返回二进制路径字符串（无 app），下面做防御。
let _electron = null;
function getElectron() {
  if (_electron !== null) return _electron;
  try {
    _electron = require('electron');
  } catch (e) {
    _electron = false;
  }
  return _electron;
}

function isPackaged() {
  const e = getElectron();
  return !!(e && e.app && e.app.isPackaged);
}

function userDataDir() {
  const e = getElectron();
  try {
    return e && e.app ? e.app.getPath('userData') : null;
  } catch (err) {
    return null;
  }
}

// 数据根目录：打包后放 userData（可写、不随 asar 只读），开发时放仓库根目录
function dataRoot() {
  if (isPackaged()) {
    const ud = userDataDir();
    if (ud) return ud;
  }
  return path.join(__dirname, '..');
}

// config.json 候选路径（按优先级）
function configCandidates() {
  const list = [];
  if (isPackaged()) {
    const ud = userDataDir();
    if (ud) list.push(path.join(ud, 'config.json'));
    if (process.resourcesPath) list.push(path.join(process.resourcesPath, 'config.json'));
  }
  list.push(path.join(__dirname, '..', 'config.json'));
  return list;
}

// 环境变量 → config 字段映射（环境变量优先级最高，覆盖文件）
const ENV_MAP = {
  ZHIYIN_DEEPSEEK_API_KEY: 'deepseekApiKey',
  DEEPSEEK_API_KEY: 'deepseekApiKey',
  ZHIYIN_DEEPSEEK_MODEL: 'deepseekModel',
  DEEPSEEK_MODEL: 'deepseekModel',
  ZHIYIN_DEEPSEEK_BASE_URL: 'deepseekBaseUrl',
  DEEPSEEK_BASE_URL: 'deepseekBaseUrl',
  ZHIYIN_CREATOR_API_KEY: 'creatorApiKey',
  CREATOR_API_KEY: 'creatorApiKey',
  ZHIYIN_CREATOR_BASE_URL: 'creatorBaseUrl',
  CREATOR_BASE_URL: 'creatorBaseUrl',
  ZHIYIN_CREATOR_AUDIO_MODEL: 'creatorAudioModel',
  CREATOR_AUDIO_MODEL: 'creatorAudioModel',
  ZHIYIN_NCM_BRIDGE_PORT: 'ncmBridgePort',
  NCM_BRIDGE_PORT: 'ncmBridgePort',
  ZHIYIN_NETEASE_API_BASE_URL: 'netEaseApiBaseUrl',
  NETEASE_API_BASE_URL: 'netEaseApiBaseUrl',
  ZHIYIN_ENRICH_AUDIO: 'enrichAudioEnabled',
  ZHIYIN_QQ_MUSIC_ENABLED: 'qqMusicEnabled',
  QQ_MUSIC_ENABLED: 'qqMusicEnabled',
};

function getConfig() {
  const cfg = {};
  // 1) 文件（先读，供环境变量覆盖）
  for (const p of configCandidates()) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (raw && typeof raw === 'object') Object.assign(cfg, raw);
      break; // 取第一个存在的文件
    } catch (e) {
      /* 继续找下一个候选 */
    }
  }
  // 2) 环境变量（覆盖文件）
  for (const [envName, key] of Object.entries(ENV_MAP)) {
    const v = process.env[envName];
    if (v !== undefined && v !== '') cfg[key] = v;
  }
  return cfg;
}

function cacheDir() {
  return path.join(dataRoot(), '.cache', 'songs');
}
function listenerDir() {
  return path.join(cacheDir(), 'listener');
}
function creatorDir() {
  return path.join(cacheDir(), 'creator');
}
function searchHistoryPath() {
  return path.join(dataRoot(), '.cache', 'search-history.json');
}

module.exports = { getConfig, isPackaged, dataRoot, cacheDir, listenerDir, creatorDir, searchHistoryPath };
