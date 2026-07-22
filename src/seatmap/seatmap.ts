import { HALL, RING } from '../data/hall';
import { BLOCKS, SEAT_ROWS, getSeat, rowsOfBlock, seatLabel, type Seat } from '../data/seats';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 画面いっぱいに引いた状態からの拡大率の範囲。 */
const MIN_SCALE = 0.7;
const MAX_SCALE = 14;

/** これ以上動かしたらクリックではなくドラッグ扱い。 */
const DRAG_THRESHOLD_PX = 4;

export interface SeatMap {
  setSelected(seatId: string | undefined): void;
  onSelect(handler: (seat: Seat) => void): void;
  resetView(): void;
  zoomBy(factor: number): void;
}

/**
 * 上から見た座席表。公式の座席表と同じ向き（北が上、南が下）で、
 * 座席の位置は data/seats.ts の座標をそのまま使う。
 * 拡大縮小・移動は <g> の transform だけで行い、SVGの中身は作り直さない。
 */
export function createSeatMap(container: HTMLElement): SeatMap {
  const margin = 1.5;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'seatmap');
  svg.setAttribute(
    'viewBox',
    `${HALL.minX - margin} ${HALL.minZ - margin} ${HALL.maxX - HALL.minX + margin * 2} ${
      HALL.maxZ - HALL.minZ + margin * 2
    }`,
  );
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const camera = document.createElementNS(SVG_NS, 'g');
  svg.append(camera);
  camera.append(createRing(), createSeats(), createRowLabels(), createBlockLabels());
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

  // 触れている指（ポインタ）を全部覚えておく。1本ならドラッグで移動、
  // 2本ならピンチで拡大縮小＋移動。指が増減したら、そのつど基準を取り直す。
  const pointers = new Map<number, { x: number; y: number }>();
  /** ジェスチャ開始時の状態。指の間隔と中心を、その時点の表示に結び付けておく。 */
  let gesture:
    | { anchor: { x: number; y: number }; spread: number; scale: number }
    | undefined;
  let dragDistance = 0;

  /** 指の中心（画面座標）と、指の間の距離。 */
  const touchCenter = () => {
    const list = [...pointers.values()];
    const x = list.reduce((sum, point) => sum + point.x, 0) / list.length;
    const y = list.reduce((sum, point) => sum + point.y, 0) / list.length;
    const spread = list.length < 2 ? 0 : Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
    return { center: { x, y }, spread };
  };

  const beginGesture = () => {
    if (pointers.size === 0) {
      gesture = undefined;
      return;
    }
    const { center, spread } = touchCenter();
    const local = toLocal({ clientX: center.x, clientY: center.y });
    // 指の中心が今つかんでいる「地図上の点」。拡大しても、ここが指の下に残る。
    gesture = {
      anchor: { x: (local.x - panX) / scale, y: (local.y - panY) / scale },
      spread,
      scale,
    };
  };

  svg.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) dragDistance = 0;
    svg.setPointerCapture(event.pointerId);
    beginGesture();
  });

  svg.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragDistance += Math.hypot(event.movementX, event.movementY);

    const { center, spread } = touchCenter();
    if (gesture.spread > 0 && spread > 0) {
      scale = clamp((gesture.scale * spread) / gesture.spread, MIN_SCALE, MAX_SCALE);
    }
    const local = toLocal({ clientX: center.x, clientY: center.y });
    panX = local.x - gesture.anchor.x * scale;
    panY = local.y - gesture.anchor.y * scale;
    applyTransform();
  });

  const handlers: ((seat: Seat) => void)[] = [];

  const endDrag = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    svg.releasePointerCapture(event.pointerId);
    // 残った指で操作を続けられるように、基準を取り直す。
    beginGesture();
    if (pointers.size > 0) return;

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

  for (const row of SEAT_ROWS) {
    const size = row.block.kind === 'flat' ? 0.36 : 0.4;
    for (const seat of row.seats) {
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(seat.x - size / 2));
      rect.setAttribute('y', String(seat.z - size / 2));
      rect.setAttribute('width', String(size));
      rect.setAttribute('height', String(size));
      rect.setAttribute('rx', '0.07');
      rect.setAttribute('class', `seat seat--${row.block.kind}`);
      rect.dataset.seatId = seat.id;

      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = seatLabel(seat);
      rect.append(title);
      group.append(rect);
    }
  }
  return group;
}

/** 各列の両端に列名（A〜R / い〜に）を出す。 */
function createRowLabels(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');

  for (const row of SEAT_ROWS) {
    const horizontal = row.block.side === 'N' || row.block.side === 'S';
    const sorted = row.seats
      .slice()
      .sort((a, b) => (horizontal ? a.x - b.x : a.z - b.z));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const offset = 0.75;

    const ends = horizontal
      ? [
          { x: first.x - offset, z: first.z },
          { x: last.x + offset, z: last.z },
        ]
      : [
          { x: first.x, z: first.z - offset },
          { x: last.x, z: last.z + offset },
        ];

    for (const end of ends) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(end.x));
      text.setAttribute('y', String(end.z + 0.15));
      text.setAttribute('class', 'row-label');
      text.textContent = row.row;
      group.append(text);
    }
  }
  return group;
}

function createBlockLabels(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');

  for (const block of BLOCKS) {
    if (block.kind === 'flat') continue;
    const rows = rowsOfBlock(block);
    const back = rows[rows.length - 1];
    const horizontal = block.side === 'N' || block.side === 'S';
    const sign = block.side === 'S' || block.side === 'E' ? 1 : -1;
    const gap = 1.6;

    const center = back.seats.reduce(
      (acc, seat) => ({ x: acc.x + seat.x / back.seats.length, z: acc.z + seat.z / back.seats.length }),
      { x: 0, z: 0 },
    );
    const x = horizontal ? center.x : center.x + sign * gap;
    const z = horizontal ? center.z + sign * gap : center.z;

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(z));
    text.setAttribute('class', 'block-label');
    if (!horizontal) text.setAttribute('transform', `rotate(${sign * 90} ${x} ${z})`);
    text.textContent = block.label;
    group.append(text);
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
  label.textContent = 'リング';

  group.append(apron, mat, label);
  return group;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
