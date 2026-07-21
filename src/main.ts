import { parseSeatId, type Seat } from './data/seats';
import { createSeatMap, seatLabel } from './seatmap/seatmap';
import { createSeatViewer } from './viewer/viewer';

const mapPanel = requireElement('map-panel');
const viewerPanel = requireElement('viewer-panel');
const status = requireElement('status');
const seatLabelText = requireElement('seat-label');
const input = requireElement<HTMLInputElement>('seat-input');
const form = requireElement<HTMLFormElement>('seat-form');

const seatMap = createSeatMap(requireElement('seatmap'));
// 3Dは初回に座席が選ばれるまで作らない（起動時は座席表だけ見せる）。
let viewer: ReturnType<typeof createSeatViewer> | undefined;

seatMap.onSelect(showSeat);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const seat = parseSeatId(input.value);
  if (!seat) {
    setStatus(`「${input.value}」に該当する座席が見つかりません。例: AS-3-12 / 2階南 4列 8番`);
    return;
  }
  showSeat(seat);
});

document.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
    .action;
  switch (action) {
    case 'zoom-in':
      return seatMap.zoomBy(1.4);
    case 'zoom-out':
      return seatMap.zoomBy(1 / 1.4);
    case 'reset-map':
      return seatMap.resetView();
    case 'recenter':
      return viewer?.recenter();
    case 'back':
      return showMap();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !viewerPanel.classList.contains('is-hidden')) showMap();
});

function showSeat(seat: Seat): void {
  viewer ??= createSeatViewer(requireElement('viewer'));
  seatMap.setSelected(seat.id);
  input.value = seat.id;
  seatLabelText.textContent = `${seatLabel(seat)}（${seat.id}）`;
  setStatus('');

  mapPanel.classList.add('is-hidden');
  viewerPanel.classList.remove('is-hidden');
  viewer.moveToSeat(seat);
  viewer.start();
}

function showMap(): void {
  viewer?.stop();
  viewerPanel.classList.add('is-hidden');
  mapPanel.classList.remove('is-hidden');
}

function setStatus(message: string): void {
  status.textContent = message;
  status.classList.toggle('is-visible', message !== '');
}

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} が見つかりません`);
  return element as T;
}
