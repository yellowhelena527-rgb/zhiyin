import { useRef } from 'react';

export default function Ball({ playing, pulsing, onClick }) {
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false });

  const onPointerDown = (e) => {
    dragRef.current = {
      dragging: true,
      startX: e.screenX,
      startY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      moved: false,
    };
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.screenX - dragRef.current.lastX;
    const dy = e.screenY - dragRef.current.lastY;
    dragRef.current.lastX = e.screenX;
    dragRef.current.lastY = e.screenY;
    if (Math.abs(e.screenX - dragRef.current.startX) + Math.abs(e.screenY - dragRef.current.startY) > 4) {
      dragRef.current.moved = true;
    }
    if (dragRef.current.moved && window.api?.moveBall) {
      window.api.moveBall(dx, dy);
    }
  };

  const onPointerUp = () => {
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (!wasDrag) onClick();
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    window.api && window.api.quitApp && window.api.quitApp();
  };

  const cls = [
    'ball-fab',
    playing ? 'ball-fab--breathing' : 'ball-fab--idle',
    pulsing ? 'ball-fab--pulsing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={cls}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onContextMenu}
      aria-label="导览球（可拖动，右键退出）"
    >
      <span className="ball-fab__pulse" />
      <span className="ball-fab__dot" />
    </button>
  );
}
