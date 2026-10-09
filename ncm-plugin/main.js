/**
 * 知音桥接插件（BetterNCM）
 *
 * 依赖 BetterNCM + InfLink-rs（slug: InfLinkrs）。InfLink-rs 负责读网易云进程内存，
 * 通过 window.InfLinkApi 暴露实时进度；本插件只做「读 API + 转发」，把进度经本地
 * WebSocket 推送给知音（Electron 主进程），绕开 SMTC 的 2 秒限流，做到零延迟。
 *
 * 关键：进度做「外推」。网易云底层约每 250ms 才更新一次原生进度，而心跳 50ms 一次；
 * 若每次心跳都原样重发 getTimeline() 的旧值，会让进度每 50ms 回退一次（抖、滞后）。
 * 所以这里记住最近一次原生进度事件的位置+墙钟时间，心跳时按「位置 + 已流逝时间」外推。
 */
(function () {
  "use strict";

  var WS_URL = "ws://127.0.0.1:4755";
  var PUSH_INTERVAL_MS = 50;

  var ws = null;
  var api = null;
  var started = false;
  var waitTimer = null;
  var pushTimer = null;

  // 进度锚点：最近一次原生进度事件的位置与墙钟时间
  var anchor = { pos: 0, at: 0, valid: false };

  function send(obj) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(obj));
      }
    } catch (e) {
      /* 忽略发送失败 */
    }
  }

  // 从原生进度事件刷新锚点（rawTimelineUpdate / 播放态切换 / 跳转后）
  function refreshAnchor() {
    try {
      var tl = api.getTimeline();
      if (tl && typeof tl.currentTime === "number") {
        anchor.pos = tl.currentTime;
        anchor.at = Date.now();
        anchor.valid = true;
      }
    } catch (e) {
      /* 忽略 */
    }
  }

  function push() {
    if (!api) return;
    try {
      var song = api.getCurrentSong();
      if (!song || !song.songName) return;
      var playing = api.getPlaybackStatus() === "Playing";
      var tl = api.getTimeline();
      var durMs =
        tl && tl.totalTime > 0 ? tl.totalTime : song.duration || 0;

      var posMs;
      if (anchor.valid) {
        // 播放中：从锚点外推；暂停：冻结在锚点
        posMs = playing ? anchor.pos + (Date.now() - anchor.at) : anchor.pos;
      } else {
        posMs = tl && typeof tl.currentTime === "number" ? tl.currentTime : 0;
      }

      send({
        type: "state",
        title: song.songName || "",
        artist: song.authorName || "",
        isPlaying: playing,
        positionMs: posMs,
        durationMs: durMs,
        ncmId: song.ncmId || null,
      });
    } catch (e) {
      /* 忽略读取失败 */
    }
  }

  function connect() {
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      return;
    }
    ws.onopen = function () {
      send({ type: "hello", plugin: "zhiyin-bridge" });
      push();
    };
    ws.onclose = function () {
      setTimeout(connect, 2000);
    };
    ws.onerror = function () {
      try {
        ws.close();
      } catch (e) {
        /* 忽略 */
      }
    };
  }

  function start() {
    if (!window.InfLinkApi) return; // InfLink-rs 尚未就绪，继续等待
    api = window.InfLinkApi;
    if (started) return;
    started = true;
    if (waitTimer) {
      clearInterval(waitTimer);
      waitTimer = null;
    }
    try {
      api.addEventListener("rawTimelineUpdate", function () {
        refreshAnchor();
        push();
      });
      api.addEventListener("songChange", function () {
        anchor.valid = false;
        push();
      });
      api.addEventListener("playStateChange", function () {
        refreshAnchor();
        push();
      });
    } catch (e) {
      /* 忽略事件注册失败 */
    }
    pushTimer = setInterval(push, PUSH_INTERVAL_MS);
    connect();
  }

  waitTimer = setInterval(start, 1000);
  start();
})();
