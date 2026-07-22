import { parseSeatId, seatLabel, type Seat } from './data/seats';
import { createSeatMap } from './seatmap/seatmap';
import { CROWD_LEVELS, type CrowdLevel } from './viewer/crowd';
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

// 観客の入り。初期状態は「なし」。3Dを作る前に押されても覚えておく。
let crowdLevel: CrowdLevel = 'none';
const crowdButtons = createCrowdButtons();

seatMap.onSelect(showSeat);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const seat = parseSeatId(input.value);
  if (!seat) {
    setStatus(
      `「${input.value}」に該当する座席が見つかりません。例: 南側 H列 23番 / N-K-45 / リングサイド北 い列 3番`,
    );
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

/** 観客の入りを切り替えるボタン。段階の一覧は crowd.ts が持っている。 */
function createCrowdButtons(): Map<CrowdLevel, HTMLButtonElement> {
  const host = requireElement('crowd-controls');
  const buttons = new Map<CrowdLevel, HTMLButtonElement>();

  for (const { level, label } of CROWD_LEVELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.classList.toggle('is-active', level === crowdLevel);
    button.addEventListener('click', () => setCrowdLevel(level));
    host.append(button);
    buttons.set(level, button);
  }

  return buttons;
}

function setCrowdLevel(level: CrowdLevel): void {
  crowdLevel = level;
  for (const [key, button] of crowdButtons) button.classList.toggle('is-active', key === level);
  viewer?.setCrowd(level);
}

function showSeat(seat: Seat): void {
  viewer ??= createSeatViewer(requireElement('viewer'));
  seatMap.setSelected(seat.id);
  input.value = seat.id;
  seatLabelText.textContent = `${seatLabel(seat)}（${seat.id}）`;
  setStatus('');

  mapPanel.classList.add('is-hidden');
  viewerPanel.classList.remove('is-hidden');
  viewer.moveToSeat(seat);
  viewer.setCrowd(crowdLevel);
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
