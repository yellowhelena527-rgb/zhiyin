const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 常驻 PowerShell：拿到 SMTC 会话管理器后循环读取。
// 位置（GetPlaybackInfo/GetTimelineProperties）每轮都查，速度最快；
// 标题/歌手（TryGetMediaPropertiesAsync）较慢，每 5 轮才查一次（换歌识别有小延迟，但位置零延迟）。
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSession, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackInfo, Windows.Media.Control, ContentType=WindowsRuntime] | Out-Null
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*' -and $_.GetParameters()[0].ParameterType.Name -notlike 'IAsyncOperationWithProgress*' })[0]
function Await($WinRtTask, $ResultType) {
  $m = $asTask.MakeGenericMethod($ResultType)
  $t = $m.Invoke($null, @($WinRtTask))
  $t.Wait(-1) | Out-Null
  $t.Result
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$players = @('cloudmusic','QQMusic','spotify','kwmusic','kugou')
$title = ''
$artist = ''
$i = 0
while ($true) {
  $json = '{"active":false}'
  try {
    $session = $manager.GetCurrentSession()
    if ($null -ne $session) {
      $pb = $session.GetPlaybackInfo()
      $tl = $session.GetTimelineProperties()
      $pos = $tl.Position
      if (-not $pos) { $pos = $pb.Position }
      $end = $tl.EndTime
      $posSec = 0.0
      $durSec = 0.0
      if ($pos) { $posSec = [double]$pos.TotalSeconds }
      if ($end) { $durSec = [double]$end.TotalSeconds }
      # SMTC 的「写入时刻」：位置被媒体应用真实写入的时间，用它做外推锚点，
      # 才能消除位置在系统管线里缓冲 ~1-2 秒造成的进度滞后。
      $lastUpdatedMs = 0
      if ($tl.LastUpdatedTime -and $tl.LastUpdatedTime.Year -gt 2000) {
        $utc = $tl.LastUpdatedTime.UtcDateTime
        $epoch = [datetime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
        $lastUpdatedMs = [long](($utc - $epoch).TotalMilliseconds)
      }
      if ($i % 5 -eq 0) {
        $media = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $title = [string]$media.Title
        $artist = [string]$media.Artist
      }
      $appId = [string]$session.SourceAppUserModelId
      $obj = @{ active=$true; channel='smtc'; appId=$appId; title=$title; artist=$artist; isPlaying=($pb.PlaybackStatus.ToString() -eq 'Playing'); position=$posSec; duration=$durSec; lastUpdated=$lastUpdatedMs }
      $json = $obj | ConvertTo-Json -Compress
    } else {
      foreach ($name in $players) {
        $p = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
        if ($p) {
          $t = [string]$p.MainWindowTitle
          $idx = $t.IndexOf(' - ')
          if ($idx -gt 0) {
            $obj = @{ active=$true; channel='window'; title=$t.Substring(0,$idx).Trim(); artist=$t.Substring($idx+3).Trim(); isPlaying=$true }
            $json = $obj | ConvertTo-Json -Compress
          }
          break
        }
      }
    }
  } catch {}
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 30
  $i++
}
`;

function createNowPlayingPoller({ onChange }) {
  const scriptPath = path.join(os.tmpdir(), 'shengjing-nowplaying.ps1');
  fs.writeFileSync(scriptPath, PS_SCRIPT, 'utf8');

  let child = null;
  let buffer = '';
  let lastKey = null;
  let stopped = false;

  function start() {
    if (child) return;
    child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        try {
          const data = JSON.parse(s);
          const key = JSON.stringify(data);
          if (key !== lastKey) {
            lastKey = key;
            onChange(data);
          }
        } catch (e) {
          /* 忽略脏行 */
        }
      }
    });
    child.on('exit', () => {
      child = null;
      if (!stopped) setTimeout(start, 1000);
    });
  }

  function stop() {
    stopped = true;
    if (child) {
      child.kill();
      child = null;
    }
  }

  return { start, stop };
}

module.exports = { createNowPlayingPoller };
