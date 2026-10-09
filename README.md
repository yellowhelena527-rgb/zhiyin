# 声境 · 耳译 — 开发对接文档

> 音乐界的「字幕组」：悬浮球实时弹出歌曲的「唱·词·曲·编」制作解析。
> 本文档给前端（eazo）对接用：**后端逻辑已全部就绪，前端只需替换「视图层」并调用现成接口。**

---

## 一、运行方式

```bash
# 双击 D:\桌面\1.0\启动.bat
# 或命令行
npm run build && npm start
```

启动后有两个窗口：
- **主窗口**：身份选择（听众/创作者）+ 导入歌单 + 批量预生成 + 缓存库。
- **悬浮球窗口**：右下角透明置顶，播放时弹出解析卡片。

---

## 二、架构总览

```
electron/main.cjs        主进程：窗口管理 + IPC 路由
electron/nowplaying.cjs  位置检测：常驻 PowerShell 轮询 SMTC（每 ~50ms）+ 窗口标题兜底
electron/ai.cjs          AI：DeepSeek(文本剧本) + Gemini(音频解析) + 缓存
electron/preload.cjs     contextBridge 暴露 window.api

src/main.jsx             主窗口入口（渲染进程）
src/ball.jsx             悬浮球窗口入口（渲染进程）
src/components/*.jsx     组件
src/logic.js             纯逻辑（findActiveHighlight / redistribute）
src/index.css / ball.css 样式
```

**关键点**：`window.api`（preload 暴露）是前端唯一入口，前端不需要碰主进程代码。

---

## 三、前端可调用的接口（window.api）

| 方法 | 参数 | 返回 / 说明 |
|---|---|---|
| `parseScreenshot(base64)` | 图片 base64（不含 data: 前缀） | `Promise<[{title, artist}]>` |
| `batchGenerate(songs)` | `[{title, artist, duration?}]` | 触发批量生成，进度/完成走事件 |
| `onBatchProgress(cb)` | — | `{done, total, title}` |
| `onBatchDone(cb)` | — | `[{...song, ok, error?}]` |
| `analyzeAudio(base64, format, title, artist)` | 音频 base64 + 'mp3'/'wav' | `Promise<script>` |
| `listCachedSongs()` | — | `Promise<string[]>`（「歌名 - 歌手」列表） |
| `onSource(cb)` | — | 订阅播放源，见下方「数据格式」 |
| `onScript(cb)` | — | 订阅 AI 剧本，见下方「数据格式」 |
| `onExternalStatus(cb)` | — | 外部播放器状态 |
| `resizeBall(mode, height?)` | 'card'/'idle' | 悬浮球窗口缩放 |
| `sendBuiltinSource(data)` | 播放器状态 | （内置播放器用，当前主窗口无内置播放器） |

---

## 四、核心数据格式

### 1. 播放源（onSource 推送）
```json
{
  "channel": "smtc | builtin | none",
  "title": "歌名",
  "artist": "歌手",
  "isPlaying": true,
  "positionSec": 123.4,
  "duration": 166,
  "at": 1712345678901
}
```
> `positionSec` 是「at 时刻」的进度；实时进度 = `positionSec + (now - at)/1000`（播放中）。

### 2. AI 剧本（onScript 推送 / analyzeAudio 返回）
```json
{
  "title": "歌名",
  "artist": "歌手",
  "mode": "listener | creator",
  "summary": "一句话",
  "highlights": [
    {
      "time": 15,
      "core": "这个时刻最核心最出彩的一句话",
      "唱": "演唱/人声角度详细解析",
      "词": "歌词角度详细解析",
      "曲": "旋律/作曲角度详细解析",
      "编": "编曲/配器角度详细解析"
    }
  ]
}
```

---

## 五、悬浮球卡片交互（当前实现，前端可直接复用或重写）

悬浮球（`src/ball.jsx`）当前逻辑：
1. 播放中 → 每秒刷新时间戳 + 根据 `positionSec` 找到当前 `highlight`；
2. 卡片默认显示 `core`，下面 4 个按钮「唱·词·曲·编」，点开显示对应维度详解；
3. `mode === 'creator'` 用 AI 给的时间点；`mode === 'listener'` 用均匀铺点兜底（`logic.js` 里的 `redistribute`）。

**融合建议**：eazo 只重写「渲染层」（卡片 DOM/样式），保留 `ball.jsx` 里的状态与检测逻辑（`onSource`/`onScript`/rAF 高亮检测）。需要我把状态抽成 `useSource()` / `useScript()` / `useHighlight()` 三个 hook 也行，直接说。

---

## 六、已知限制（重要）

- **拖动进度条后仍可能有 ~2 秒瞬时滞后**：位置更新频率取决于源端（网易云 InfLink-rs 插件每 2 秒刷一次；QQ 音乐等原生 SMTC 更密）。连续播放进度已改用 SMTC 的 `LastUpdatedTime` 做外推锚点（不再用 +1s 魔数补偿），无系统性滞后；仅剩「拖动/跳转后」到源端下一次上报之间的一小段。内存读取能根治但未钉死地址（新版改成了 float 秒存储），暂未解决。
- **AI 时间点**：听众模式现在会抓取真实歌词的 LRC 时间戳，把注脚点「钉」在真实演唱时刻上（不再靠 AI 猜秒数）；歌词源为 **QQ 音乐（TME 原生）优先、网易云回退**；拿不到歌词时才退回均匀铺点。
- 只有 MP3/WAV 支持音频解析，视频需抽音频（ffmpeg）未做。

---

## 七、配置文件 config.json

```json
{
  "deepseekApiKey": "...",       // 听众模式文本生成
  "deepseekModel": "deepseek-v4-pro",
  "deepseekBaseUrl": "https://api.deepseek.com/v1",
  "creatorApiKey": "...",        // Google Gemini API Key（创作者模式音频解析 + 快速文本生成）
  "creatorBaseUrl": "https://generativelanguage.googleapis.com/v1beta",
  "creatorAudioModel": "gemini-3.5-flash",
  "ncmBridgePort": 4755,
  "enrichAudioEnabled": true,    // 是否联网下载 iTunes 30s 预览喂给 Gemini 打底（见「隐私」）
  "qqMusicEnabled": true         // 是否优先用 QQ 音乐（TME 原生）抓真实歌词；关掉则回退网易云
}
```

- **密钥请优先用环境变量**（优先级高于 config.json，避免明文 Key 误提交）：`DEEPSEEK_API_KEY` / `CREATOR_API_KEY` / `DEEPSEEK_BASE_URL` / `CREATOR_BASE_URL` / `DEEPSEEK_MODEL` / `CREATOR_AUDIO_MODEL` / `NCM_BRIDGE_PORT` / `NETEASE_API_BASE_URL` / `ENRICH_AUDIO` / `QQ_MUSIC_ENABLED`。
- **打包后**：config.json 与缓存不再写进 `app.asar`，而是落到系统 `userData` 目录（`%APPDATA%/知音` 或 `%APPDATA%/Electron` 下）。首次运行在那里放一份 config.json 即可；数据（`.cache/songs`、搜索历史）也写到 userData。
- **未配置任何 Key**：不会空弹/报错，而是返回明确标注「演示注脚」的占位内容，方便先跑通看效果。

## 七·一、隐私说明

- **创作者模式**会把整首歌音频、**歌单导入**会把歌单截图，发送给 Google Gemini 官方接口（`creatorBaseUrl`）做解析。
- **`enrichAudioEnabled: true`（默认）**：听众模式还会联网到 iTunes 搜索并下载该曲 30 秒预览，再发给音频模型「听一遍」以校正注脚（提高冷门歌准确度）。
- 若不想让音频/截图离开本机：设 `enrichAudioEnabled: false` 关闭音频打底；创作者模式与截图导入是核心功能，会始终把对应内容发给所配置的 AI 服务商——请使用你信任、符合合规要求的服务。

---

## 八、网易云「零延迟」实时同步（BetterNCM）

普通播放器（Spotify / QQ 音乐 / 酷狗等）走系统 SMTC 即可实时同步；**网易云不原生暴露实时进度**，需要装一层插件。为把网易云也做到「零延迟」（绕开 SMTC 的 ~2 秒限流），知音内置了一套桥接：

```
网易云音乐 ── InfLink-rs 插件（读进程内存，暴露 window.InfLinkApi）
          ── 知音桥接插件 ncm-plugin（读 API + 转发，100ms 心跳）
          ── ws://127.0.0.1:4755（知音 Electron 主进程 WebSocket 服务）
          ── ncm-local 来源通道（activeSource 最高优先级）
```

**用户侧三步接入（主窗口左上角「网易云 · 实时同步」引导面板会自动检测 + 一键安装）：**

1. 安装 [BetterNCM](https://github.com/BetterNCM/BetterNCM/releases)（插件框架，默认装到 `C:\betterncm`）；
2. 在 BetterNCM 插件商店安装 [InfLink-rs](https://github.com/apoint123/inflink-rs/releases)（负责读实时进度）；
3. 在引导面板点「一键安装」知音桥接插件（把仓库 `ncm-plugin/` 复制到 `C:\betterncm\plugins\zhiyin-bridge\`），重启网易云后自动连接。

**已知限制：**

- 需安装 BetterNCM + InfLink-rs（网易云不原生暴露实时进度，躲不开）；
- 桥接插件依赖 InfLink-rs 的内存读取，网易云大版本升级后 InfLink-rs 可能需更新；
- 端口固定 `4755`，知音（`config.json` 的 `ncmBridgePort`）与 `ncm-plugin/main.js` 须一致。
