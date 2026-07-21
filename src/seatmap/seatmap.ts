import { HALL, RING } from '../data/hall';
import { BLOCKS, SEATS, getSeat, seatsInRow, type Seat } from '../data/seats';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 画面いっぱいに引いた状態からの拡大率の範囲。 */
const MIN_SCALE = 0.6;
const MAX_SCALE = 12;

/** これ以上動かしたらクリックではなくドラッグ扱い。 */
const DRAG_THRESHOLD_PX = 4;

export interface SeatMap {
  /** 選択中の座席を塗り分ける。undefined で選択解除。 */
  setSelected(seatId: string | undefined): void;
  /** 座席がクリックされたときに呼ばれる。 */
  onSelect(handler: (seat: Seat) => void): void;
  /** 拡大縮小・移動を初期状態に戻す。 */
  resetView(): void;
  zoomBy(factor: number): void;
}

/**
 * 上から見た座席表。X→右、Z→下（南が下）。
 * 拡大縮小・移動は <g> の transform だけで行い、SVGの中身は作り直さない。
 */
export function createSeatMap(container: HTMLElement): SeatMap {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'seatmap');
  svg.setAttribute(
    'viewBox',
    `${-HALL.halfX} ${-HALL.halfZ} ${HALL.halfX * 2} ${HALL.halfZ * 2}`,
  );
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const camera = document.createElementNS(SVG_NS, 'g');
  svg.append(camera);
  camera.append(createRing(), createBlockLabels(), createSeats());
  container.append(svg);

  const seatNodes = new Map<string, SVGRectElement>();
  for (const node of camera.querySelectorAll<SVGRectElement>('[data-seat-id]')) {
    seatNodes.set(node.dataset.seatId!, node);
  }

  let scale = 1;
  let panX = 0;
  let panY = 0;
  const applyTransform = () => {
    camera.setAttribute('transform', `translate(${panX} ${panY}) scale(${scale})`);
    // 文字だけは拡大しても同じ大きさで読めるように、CSS側で拡大率を打ち消す。
    svg.style.setProperty('--map-scale', String(scale));
  };

  /** 画面座標 → viewBox座標。 */
  const toLocal = (event: { clientX: number; clientY: number }) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y };
  };

  /** カーソル位置を固定したまま拡大率を変える。 */
  const zoomAt = (factor: number, local: { x: number; y: number }) => {
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    const applied = next / scale;
    panX = local.x - (local.x - panX) * applied;
    panY = local.y - (local.y - panY) * applied;
    scale = next;
    applyTransform();
  };

  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(Math.exp(-event.deltaY * 0.0015), toLocal(event));
  });

  let dragPointer: number | undefined;
  let dragOrigin = { x: 0, y: 0 };
  let dragStartPan = { x: 0, y: 0 };
  let dragDistance = 0;

  svg.addEventListener('pointerdown', (event) => {
    if (dragPointer !== undefined) return;
    dragPointer = event.pointerId;
    dragOrigin = toLocal(event);
    dragStartPan = { x: panX, y: panY };
    dragDistance = 0;
    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener('pointermove', (event) => {
    if (event.pointerId !== dragPointer) return;
    const local = toLocal(event);
    panX = dragStartPan.x + (local.x - dragOrigin.x);
    panY = dragStartPan.y + (local.y - dragOrigin.y);
    dragDistance = Math.hypot(event.movementX, event.movementY) + dragDistance;
    applyTransform();
  });

  const handlers: ((seat: Seat) => void)[] = [];

  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = undefined;
    svg.releasePointerCapture(event.pointerId);

    // ドラッグ中はポインタをSVGごとキャプチャしている＝click は座席rectではなく
    // SVGに飛んでくるので、離した位置から座席を引き直す。
    if (event.type !== 'pointerup' || dragDistance > DRAG_THRESHOLD_PX) return;
    const hit = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<SVGRectElement>('[data-seat-id]');
    const seat = hit?.dataset.seatId ? getSeat(hit.dataset.seatId) : undefined;
    if (!seat) return;
    for (const handler of handlers) handler(seat);
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  let selected: SVGRectElement | undefined;
  applyTransform();

  return {
    setSelected(seatId) {
      selected?.classList.remove('is-selected');
      selected = seatId ? seatNodes.get(seatId) : undefined;
      selected?.classList.add('is-selected');
    },
    onSelect(handler) {
      handlers.push(handler);
    },
    resetView() {
      scale = 1;
      panX = 0;
      panY = 0;
      applyTransform();
    },
    zoomBy(factor) {
      zoomAt(factor, { x: 0, y: 0 });
    },
  };
}

function createSeats(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  const size = 0.38;

  for (const seat of SEATS) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(seat.x - size / 2));
    rect.setAttribute('y', String(seat.z - size / 2));
    rect.setAttribute('width', String(size));
    rect.setAttribute('height', String(size));
    rect.setAttribute('rx', '0.08');
    rect.setAttribute('class', `seat seat--${seat.block.level}`);
    rect.dataset.seatId = seat.id;

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = seatLabel(seat);
    rect.append(title);

    group.append(rect);
  }
  return group;
}

function createRing(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');

  const apron = document.createElementNS(SVG_NS, 'rect');
  apron.setAttribute('x', String(-RING.apronHalf));
  apron.setAttribute('y', String(-RING.apronHalf));
  apron.setAttribute('width', String(RING.apronHalf * 2));
  apron.setAttribute('height', String(RING.apronHalf * 2));
  apron.setAttribute('class', 'ring-apron');

  const mat = document.createElementNS(SVG_NS, 'rect');
  mat.setAttribute('x', String(-RING.matHalf));
  mat.setAttribute('y', String(-RING.matHalf));
  mat.setAttribute('width', String(RING.matHalf * 2));
  mat.setAttribute('height', String(RING.matHalf * 2));
  mat.setAttribute('class', 'ring-mat');

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('x', '0');
  label.setAttribute('y', '0.4');
  label.setAttribute('class', 'ring-label');
  label.textContent = 'RING';

  group.append(apron, mat, label);
  return group;
}

function createBlockLabels(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');

  for (const block of BLOCKS) {
    // 最後列の中央あたり、客席の少し外側に置く。
    const lastRow = block.rows;
    const depth = block.firstRowDepth + (lastRow - 1) * block.rowPitch + 0.85;
    const offsets = { S: [0, depth], N: [0, -depth], E: [depth, 0], W: [-depth, 0] }[block.side];

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(offsets[0]));
    text.setAttribute('y', String(offsets[1]));
    text.setAttribute('class', 'block-label');
    // 東西のブロックは横に並ぶと文字列同士がぶつかるので縦書き相当に倒す。
    if (block.side === 'E' || block.side === 'W') {
      const angle = block.side === 'E' ? 90 : -90;
      text.setAttribute('transform', `rotate(${angle} ${offsets[0]} ${offsets[1]})`);
    }
    text.textContent = `${block.label} (${block.rows}列 / 最大${seatsInRow(block, lastRow)}番)`;
    group.append(text);
  }
  return group;
}

export function seatLabel(seat: Seat): string {
  return `${seat.block.label} ${seat.row}列 ${seat.number}番`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
