/* Pointer-based drag of a list row onto a drop target.
   Uses a dedicated handle (touch-action: none) so touch scrolling still works. */

export function initDragToTarget({ container, handleSelector, rowSelector, target, ghost, getItem, onDrop }) {
  let active = null;

  const overTarget = (x, y) => {
    const r = target.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const moveGhost = (x, y) => {
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y - 28}px`;
  };

  const end = (commit) => {
    if (!active) return;
    const { row, item, pointerId, handle } = active;
    try { handle.releasePointerCapture(pointerId); } catch { /* already gone */ }
    ghost.hidden = true;
    document.body.classList.remove('is-dragging');
    target.classList.remove('unit-bar--drop-active', 'unit-bar--drop-over');
    row.classList.remove('place--dragging');
    active = null;
    if (commit) onDrop(item);
  };

  container.addEventListener('pointerdown', event => {
    const handle = event.target.closest(handleSelector);
    if (!handle || !container.contains(handle) || event.button > 0) return;
    const row = handle.closest(rowSelector);
    if (!row) return;
    const item = getItem(row);
    if (!item) return;

    event.preventDefault();
    active = { row, handle, item, pointerId: event.pointerId, over: false };
    try { handle.setPointerCapture(event.pointerId); } catch { /* unsupported */ }

    ghost.innerHTML = '';
    const icon = document.createElement('span');
    icon.className = 'ms';
    icon.textContent = 'straighten';
    const label = document.createElement('span');
    label.textContent = item.name;
    ghost.append(icon, label);
    ghost.hidden = false;
    moveGhost(event.clientX, event.clientY);

    row.classList.add('place--dragging');
    document.body.classList.add('is-dragging');
    target.classList.add('unit-bar--drop-active');
  });

  container.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    const over = overTarget(event.clientX, event.clientY);
    if (over !== active.over) {
      active.over = over;
      target.classList.toggle('unit-bar--drop-over', over);
    }
  });

  container.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    end(overTarget(event.clientX, event.clientY));
  });

  container.addEventListener('pointercancel', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    end(false);
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') end(false);
  });

  return { cancel: () => end(false), isDragging: () => Boolean(active) };
}
