import * as THREE from 'three';

import { BALCONY } from '../data/hall';
import { BLOCKS, SEATS, rowsOfBlock } from '../data/seats';
import { OUTWARD_YAW } from './scene';

/**
 * 客席の観客。
 *
 * 席がどれだけ埋まっているかを5段階で切り替える。誰がどの席に座るかは乱数だが、
 * 同じ入りなら毎回同じ絵になるように種を固定した擬似乱数を使う。
 * 男女はほぼ半々、全体の2割ほどが子供（背が低い）。
 *
 * 人は席ごとに1体ずつ InstancedMesh で描く。1571席ぶん置いても
 * ドローコールは「男女 × 部品数」で済む。
 */

/** 入りの段階。none が初期状態。 */
export type CrowdLevel = 'none' | 'sparse' | 'full' | 'packed' | 'soldout';

export const CROWD_LEVELS: { level: CrowdLevel; label: string }[] = [
  { level: 'soldout', label: '超満員札止め' },
  { level: 'packed', label: '超満員' },
  { level: 'full', label: '満員' },
  { level: 'sparse', label: 'ガラガラ' },
  { level: 'none', label: 'なし' },
];

/** その段階で席が埋まる割合と、立ち見が出るかどうか。 */
const OCCUPANCY: Record<Exclude<CrowdLevel, 'none'>, { ratio: number; standing: boolean }> = {
  soldout: { ratio: 1, standing: true },
  packed: { ratio: 0.9, standing: false },
  full: { ratio: 0.7, standing: false },
  sparse: { ratio: 0.3, standing: false },
};

export interface Crowd {
  group: THREE.Group;
  /**
   * その席の観客だけ消す（自分が座る席に人がいると、頭が目の前に来てしまう）。
   * undefined で全員戻す。
   */
  setEmptySeat(id: string | undefined): void;
  dispose(): void;
}

/** 子供の割合と、男女比（0.5 = 半々）。 */
const CHILD_RATIO = 0.2;
const FEMALE_RATIO = 0.5;

const SKIN_TONES = [0xd8b189, 0xc99b6e, 0xb98b5f, 0xe3c39d, 0xa9784f];
const HAIR_COLORS = [0x1b1614, 0x241c17, 0x2f2319, 0x4a3222, 0x6b4a2c, 0x9a958e];
const SHIRT_MALE = [0x2f4a72, 0x1f2a38, 0x3b3f46, 0x646b76, 0x27603f, 0x8a3b2f, 0xcfcac0, 0x2b2b2e];
const SHIRT_FEMALE = [0xb03a52, 0xc9697f, 0x7a4a9c, 0xc9963a, 0xdcd7cc, 0x2f7a6a, 0x3b5aa6, 0x8f4a6b];
const SHIRT_CHILD = [0xd9b93a, 0x3f9fd0, 0xd9663a, 0x57ab57, 0xd94f7a, 0xf0ece2];
const PANTS_COLORS = [0x2b3140, 0x1c1e24, 0x3a3f4a, 0x4a4034, 0x22354f, 0x5a5f68];
const SHOE_COLORS = [0x1b1b1e, 0x2a2a2e, 0xcbc7bd, 0x4a3a2c];

type Tint = 'skin' | 'hair' | 'shirt' | 'pants' | 'shoe';

interface Figure {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  female: boolean;
  colors: Record<Tint, number>;
  /** 席に座っている人だけ持つ（立ち見にはない）。 */
  seatId?: string;
}

interface FigurePart {
  geometry: THREE.BufferGeometry;
  tint: Tint;
  position: [number, number, number];
  /** X軸まわりの傾き。腕を前に垂らすのに使う。 */
  tiltX?: number;
}

/** 同じ部品構成でまとめて描ける一群（座り／立ち × 男／女）。 */
interface Batch {
  figures: Figure[];
  locals: THREE.Matrix4[];
  meshes: THREE.InstancedMesh[];
}

export function createCrowd(level: CrowdLevel): Crowd {
  const group = new THREE.Group();
  if (level === 'none') {
    return { group, setEmptySeat: () => {}, dispose: () => {} };
  }

  const { ratio, standing } = OCCUPANCY[level];
  const random = seededRandom(0x6b1a17);

  // 席の観客。バルコニーだけは椅子がないので立ったまま（実際も手すりの前に立つ席）。
  const seated: Figure[] = [];
  const standers: Figure[] = [];
  for (const seat of SEATS) {
    if (random() > ratio) continue;
    const figure = makeFigure(random, seat.x, seat.y, seat.z, OUTWARD_YAW[seat.block.side]);
    figure.seatId = seat.id;
    (seat.block.kind === 'balcony' ? standers : seated).push(figure);
  }

  if (standing) {
    for (const spot of standingSpots()) {
      standers.push(makeFigure(random, spot.x, spot.y, spot.z, spot.yaw));
    }
  }

  const batches: Batch[] = [
    buildBatch(seated.filter((figure) => !figure.female), seatedParts(false), group),
    buildBatch(seated.filter((figure) => figure.female), seatedParts(true), group),
    buildBatch(standers.filter((figure) => !figure.female), standingParts(false), group),
    buildBatch(standers.filter((figure) => figure.female), standingParts(true), group),
  ];

  // 席番号から「どの一群の何番目か」を引けるようにしておく（1席だけ消すため）。
  const bySeat = new Map<string, { batch: Batch; index: number }>();
  for (const batch of batches) {
    batch.figures.forEach((figure, index) => {
      if (figure.seatId) bySeat.set(figure.seatId, { batch, index });
    });
  }

  let emptied: string | undefined;
  const setEmptySeat = (id: string | undefined) => {
    if (id === emptied) return;
    if (emptied) applyFigure(bySeat.get(emptied), true);
    applyFigure(bySeat.get(id ?? ''), false);
    emptied = id;
  };

  return {
    group,
    setEmptySeat,
    dispose: () => {
      for (const batch of batches) {
        for (const mesh of batch.meshes) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      }
    },
  };
}

/** その席の人を出す／消す（消すのは大きさを0にするだけ）。 */
function applyFigure(entry: { batch: Batch; index: number } | undefined, visible: boolean): void {
  if (!entry) return;
  const { batch, index } = entry;
  const figure = batch.figures[index];
  const matrix = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  batch.meshes.forEach((mesh, part) => {
    if (visible) {
      composeFigure(body, figure);
      matrix.multiplyMatrices(body, batch.locals[part]);
    } else {
      matrix.makeScale(0, 0, 0);
    }
    mesh.setMatrixAt(index, matrix);
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function composeFigure(target: THREE.Matrix4, figure: Figure): THREE.Matrix4 {
  return target.compose(
    new THREE.Vector3(figure.x, figure.y, figure.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, figure.yaw, 0)),
    new THREE.Vector3(figure.scale, figure.scale, figure.scale),
  );
}

/** 部品ごとに InstancedMesh を1つ作る。色は席ごとに instanceColor で散らす。 */
function buildBatch(figures: Figure[], parts: FigurePart[], parent: THREE.Group): Batch {
  const batch: Batch = { figures, locals: [], meshes: [] };
  const local = new THREE.Matrix4();
  const body = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const color = new THREE.Color();

  for (const part of parts) {
    local.compose(
      new THREE.Vector3().fromArray(part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(part.tiltX ?? 0, 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    batch.locals.push(local.clone());

    // 素材の色は白にしておいて、instanceColor で1体ずつ着色する。
    const mesh = new THREE.InstancedMesh(
      part.geometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }),
      Math.max(figures.length, 1),
    );
    figures.forEach((figure, index) => {
      mesh.setMatrixAt(index, world.multiplyMatrices(composeFigure(body, figure), local));
      mesh.setColorAt(index, color.setHex(figure.colors[part.tint]));
    });
    mesh.count = figures.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    batch.meshes.push(mesh);
    parent.add(mesh);
  }

  return batch;
}

function makeFigure(
  random: () => number,
  x: number,
  y: number,
  z: number,
  yaw: number,
): Figure {
  const child = random() < CHILD_RATIO;
  const female = random() < FEMALE_RATIO;
  const shirts = child ? SHIRT_CHILD : female ? SHIRT_FEMALE : SHIRT_MALE;

  return {
    x,
    y,
    z,
    yaw,
    // 大人でも身長にばらつきを付ける。子供は7〜8割の背丈。
    scale: child ? 0.7 + random() * 0.12 : 0.95 + random() * 0.12,
    female,
    colors: {
      skin: pick(random, SKIN_TONES),
      hair: pick(random, HAIR_COLORS),
      shirt: pick(random, shirts),
      pants: pick(random, PANTS_COLORS),
      shoe: pick(random, SHOE_COLORS),
    },
  };
}

/**
 * 立ち見の位置。超満員札止めのときだけ、南側スタンドの最後列の後ろと、
 * 2階バルコニーの後ろ（座席より一段高い奥のデッキ）に並ぶ。
 */
function standingSpots(): { x: number; y: number; z: number; yaw: number }[] {
  const spots: { x: number; y: number; z: number; yaw: number }[] = [];

  const south = BLOCKS.find((block) => block.code === 'S');
  if (south) {
    const rows = rowsOfBlock(south);
    const last = rows[rows.length - 1];
    const xs = last.seats.map((seat) => seat.x);
    const z = last.depth + 0.4;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) {
      spots.push({ x, y: last.y, z, yaw: OUTWARD_YAW.S });
    }
  }

  // バルコニーは座席の後ろの一段高いデッキ。
  for (const sign of [1, -1]) {
    for (let z = BALCONY.minZ + 0.4; z <= BALCONY.maxZ - 0.4; z += 0.55) {
      spots.push({
        x: sign * (BALCONY.innerX + 1.4),
        y: BALCONY.floorY + 0.45,
        z,
        yaw: sign > 0 ? OUTWARD_YAW.E : OUTWARD_YAW.W,
      });
    }
  }

  return spots;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const capsule = (radius: number, length: number) =>
  new THREE.CapsuleGeometry(radius, length, 3, 8);
const head = () => new THREE.SphereGeometry(0.1, 10, 8);
/** 後頭部を覆う髪。顔の側は開けておく。 */
const hairCap = () => new THREE.SphereGeometry(0.106, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);

/**
 * 椅子に座った人。椅子と同じローカル座標（足元の中心が原点、+Zが背中側）で組む。
 * 座面は床から0.44mあたりなので、腿はその高さで前へ、脛はそこから床へ下ろす。
 */
function seatedParts(female: boolean): FigurePart[] {
  const parts: FigurePart[] = [];

  for (const side of [-1, 1]) {
    parts.push(
      { geometry: box(0.14, 0.44, 0.15), tint: 'pants', position: [side * 0.11, 0.22, -0.3] },
      { geometry: box(0.14, 0.07, 0.25), tint: 'shoe', position: [side * 0.11, 0.035, -0.39] },
      { geometry: box(0.15, 0.15, 0.42), tint: 'pants', position: [side * 0.11, 0.5, -0.15] },
      // 腕は膝の上に垂らす。
      {
        geometry: capsule(0.05, 0.24),
        tint: 'shirt',
        position: [side * 0.2, 0.68, -0.06],
        tiltX: 0.55,
      },
    );
  }

  parts.push(
    { geometry: capsule(0.145, 0.28), tint: 'shirt', position: [0, 0.78, 0.04] },
    { geometry: capsule(0.05, 0.05), tint: 'skin', position: [0, 0.96, 0.03] },
    { geometry: head(), tint: 'skin', position: [0, 1.06, 0.02] },
    { geometry: hairCap(), tint: 'hair', position: [0, 1.062, 0.03] },
  );
  // 女性は後ろ髪を長めに。男女の見分けはこれと服の色だけ。
  if (female) parts.push({ geometry: box(0.19, 0.22, 0.1), tint: 'hair', position: [0, 0.98, 0.1] });

  return parts;
}

/** 立ち見の人。座り姿と同じローカル座標で、足元が床。 */
function standingParts(female: boolean): FigurePart[] {
  const parts: FigurePart[] = [];

  for (const side of [-1, 1]) {
    parts.push(
      { geometry: box(0.15, 0.88, 0.17), tint: 'pants', position: [side * 0.11, 0.44, 0] },
      { geometry: box(0.15, 0.07, 0.26), tint: 'shoe', position: [side * 0.11, 0.035, -0.04] },
      { geometry: capsule(0.05, 0.3), tint: 'shirt', position: [side * 0.2, 1.12, 0.01] },
    );
  }

  parts.push(
    { geometry: capsule(0.15, 0.32), tint: 'shirt', position: [0, 1.18, 0] },
    { geometry: capsule(0.05, 0.05), tint: 'skin', position: [0, 1.42, 0] },
    { geometry: head(), tint: 'skin', position: [0, 1.53, 0] },
    { geometry: hairCap(), tint: 'hair', position: [0, 1.532, 0.01] },
  );
  if (female) parts.push({ geometry: box(0.19, 0.22, 0.1), tint: 'hair', position: [0, 1.45, 0.08] });

  return parts;
}

const pick = (random: () => number, list: number[]) => list[Math.floor(random() * list.length)];

/** 種を固定した擬似乱数（mulberry32）。同じ入りなら毎回同じ客席になる。 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
