// 当前时间点所属的导览点（最后一个 time <= t 的点）
export function findActiveHighlight(highlights, t) {
  let active = null;
  for (let i = 0; i < highlights.length; i++) {
    if (t >= highlights[i].time) active = highlights[i];
    else break;
  }
  return active;
}
