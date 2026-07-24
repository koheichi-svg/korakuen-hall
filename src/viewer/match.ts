import * as THREE from 'three';

import { RING } from '../data/hall';

/**
 * リング上の試合（レスラー2人＋レフェリー）と、リング下のセコンド。
 *
 * 人は関節を持つ入れ子のGroupで組み、`Pose`（関節角の集まり）と `Key`（時刻・立ち位置・
 * 姿勢）で動かす。試合は `DURATION` 秒で一巡する固定の振り付けで、当たり判定も
 * 物理も持たない——2人が組み合って見えるのは、両者のキーを同じ立ち位置から
 * 導いているからなので、片方の位置を動かすときは相手側も一緒に直すこと。
 *
 * 流れ: 組み合ってバックを取り合う → ロープ越しに場外へ落とし、ノータッチの
 * トペコンヒーロ → リングに戻して投げ技の応酬 → スリーカウント → 構え直して先頭へ。
 */

/** 試合1周の長さ（秒）。最後のキーは先頭のキーと同じ姿勢にしてループをつなぐ。 */
const DURATION = 60;

/** リングのマット面の高さ（キャンバスの上面）。 */
const MAT = RING.matY + 0.1;
/** リング下の黒いマットの上面。 */
const FLOOR = 0.03;

const SKIN = 0xbd8657;

const standard = (color: number, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness });

// ---------------------------------------------------------------------------
// 体
// ---------------------------------------------------------------------------

interface FighterSpec {
  height: number;
  hair: number;
  /** 上半身。裸なら肌色、レフェリーはシャツの色。 */
  torso: number;
  /** 短パン・ロングタイツ・スラックスの色。 */
  legs: number;
  /** タイツのサイドに入る差し色。 */
  accent?: number;
  /** 袖。`short` は二の腕まで、`long` は手首までシャツ色になる（なしは上半身裸）。 */
  sleeves?: 'short' | 'long';
  /** 坊主頭。髪をシルエットにせず、地肌に沿った薄いキャップにする。 */
  buzz?: boolean;
  /** 手首のテーピング（白）。 */
  wristTape?: boolean;
  belt?: number;
  /** 片腕のエルボーパッド。 */
  elbowPad?: number;
}

/**
 * 関節を持つ人ひとり。
 * `root` が床の上の立ち位置（+Zが正面）で、`body`（腰）から上下に枝分かれする。
 * 倒れる動きは `body` の傾きで作るので、寝ているときの `root` は足元ではなく腰の真下。
 */
interface Fighter {
  root: THREE.Group;
  /** 腰。全身の傾き（前後・左右）の中心。 */
  body: THREE.Group;
  /** 胸から上。腰に対する上体のひねり・前傾。 */
  chest: THREE.Group;
  head: THREE.Group;
  shoulderR: THREE.Group;
  shoulderL: THREE.Group;
  elbowR: THREE.Group;
  elbowL: THREE.Group;
  hipR: THREE.Group;
  hipL: THREE.Group;
  kneeR: THREE.Group;
  kneeL: THREE.Group;
  height: number;
}

function createFighter(spec: FighterSpec): Fighter {
  const h = spec.height;
  const skin = standard(SKIN, 0.75);
  const cloth = standard(spec.legs, 0.7);
  const shirt = standard(spec.torso, 0.75);

  // 体節の長さ。立ったときに足の裏がちょうど床に来るように取ってある。
  const thighLen = 0.24 * h;
  const shinLen = 0.22 * h;
  const upperLen = 0.18 * h;
  const foreLen = 0.17 * h;
  /** 両端が半球のカプセル。指定した長さちょうどに収まる胴の直径ぶんを引く。 */
  const limb = (radius: number, length: number) =>
    new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 4, 8);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11 * h, 0.19), cloth);
  body.add(pelvis);

  if (spec.belt !== undefined) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.21), standard(spec.belt, 0.5));
    belt.position.y = 0.045 * h;
    body.add(belt);
  }

  // 脚。side = +1 が右（+X側）。
  const hips: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.02 * h, 0);
    body.add(hip);

    const thigh = new THREE.Mesh(limb(0.083, thighLen), cloth);
    thigh.position.y = -thighLen / 2;
    hip.add(thigh);

    // タイツのサイドに入る差し色。
    if (spec.accent !== undefined) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, thighLen * 0.75, 0.1),
        standard(spec.accent, 0.7),
      );
      stripe.position.set(side * 0.062, -thighLen * 0.45, 0);
      hip.add(stripe);
    }

    const knee = new THREE.Group();
    knee.position.y = -thighLen;
    hip.add(knee);

    const shin = new THREE.Mesh(limb(0.075, shinLen), cloth);
    shin.position.y = -shinLen / 2;
    knee.add(shin);

    const boot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.06 * h, 8),
      standard(0x121215, 0.6),
    );
    boot.position.y = -shinLen - 0.01 * h;
    knee.add(boot);

    hips.push(hip);
    knees.push(knee);
  }

  const chest = new THREE.Group();
  chest.position.y = 0.055 * h;
  body.add(chest);

  const torso = new THREE.Mesh(limb(0.155, 0.3 * h), shirt);
  torso.scale.set(1.15, 1, 0.78);
  torso.position.y = 0.105 * h;
  chest.add(torso);

  // 腕。
  const shoulders: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, 0.225 * h, 0);
    chest.add(shoulder);

    const upper = new THREE.Mesh(limb(0.066, upperLen), spec.sleeves ? shirt : skin);
    upper.position.y = -upperLen / 2;
    shoulder.add(upper);

    if (spec.elbowPad !== undefined && side === 1) {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.078, 0.078, 0.11, 8),
        standard(spec.elbowPad, 0.7),
      );
      pad.position.y = -upperLen * 0.92;
      shoulder.add(pad);
    }

    const elbow = new THREE.Group();
    elbow.position.y = -upperLen;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(limb(0.056, foreLen), spec.sleeves === 'long' ? shirt : skin);
    fore.position.y = -foreLen / 2;
    elbow.add(fore);

    if (spec.wristTape) {
      const tape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.07, 8),
        standard(0xf2f0ea, 0.8),
      );
      tape.position.y = -foreLen * 0.86;
      elbow.add(tape);
    }

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), skin);
    hand.position.y = -foreLen - 0.03;
    elbow.add(hand);

    shoulders.push(shoulder);
    elbows.push(elbow);
  }

  const head = new THREE.Group();
  head.position.y = 0.275 * h;
  chest.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05 * h, 8), skin);
  neck.position.y = 0.015 * h;
  head.add(neck);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), skin);
  skull.scale.set(0.92, 1.05, 0.95);
  skull.position.y = 0.095 * h;
  head.add(skull);

  // 髪は頭のてっぺんから後頭部を覆うキャップ。前は開けて顔にする。
  // 坊主は膨らませず、地肌のすぐ外側を耳の高さまで薄く覆う。
  const hair = new THREE.Mesh(
    spec.buzz
      ? new THREE.SphereGeometry(0.109, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)
      : new THREE.SphereGeometry(0.112, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    standard(spec.hair, 0.9),
  );
  if (spec.buzz) hair.scale.set(0.95, 1.04, 0.97);
  else hair.scale.set(0.95, 1.1, 1.0);
  hair.position.set(0, 0.097 * h, spec.buzz ? -0.004 : -0.012);
  head.add(hair);

  return {
    root,
    body,
    chest,
    head,
    shoulderR: shoulders[0],
    shoulderL: shoulders[1],
    elbowR: elbows[0],
    elbowL: elbows[1],
    hipR: hips[0],
    hipL: hips[1],
    kneeR: knees[0],
    kneeL: knees[1],
    height: h,
  };
}

// ---------------------------------------------------------------------------
// 姿勢
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];

/**
 * 関節角の集まり。単位はラジアン。書きやすさを優先して、符号は部位ごとに
 * 「自然な向き」を正に取っている:
 *
 * - `pitch` / `spine` / `head` の x … 正で前傾（±π/2 で横倒し）
 * - `roll` … 正で右（+X側）に傾く
 * - `armR/L` `legR/L` の x … 正で前に振り出す / y … ひねり / z … 正で外に開く
 * - `elbow` / `knee` … 正で曲げる（肘は前、膝は後ろに曲がる）
 *
 * 左右は `side` で鏡にするので、右腕を上げる値をそのまま左腕に書けば同じ形になる。
 *
 * `pitch` は**体ごと**傾ける（倒れる・飛ぶ）ためのもので、脚も一緒に倒れる。
 * 立ったまま前かがみになるのは腰から上の話なので `spine` で作ること。
 */
interface Pose {
  /**
   * 腰の高さ（身長比）。`ground` が1のときは脚の角度から自動で決まるので、
   * 書く必要があるのは浮いている・寝ている姿勢だけ。
   */
  hip?: number;
  /**
   * 1で「低い方の足の裏が床に着く高さ」に腰を置く。寝ている・飛んでいる姿勢は0にして
   * `hip` を直接与える。間の値は補間の途中で通るだけ。
   */
  ground?: number;
  pitch?: number;
  roll?: number;
  spine?: Vec3;
  head?: Vec3;
  armR?: Vec3;
  armL?: Vec3;
  elbowR?: number;
  elbowL?: number;
  legR?: Vec3;
  legL?: Vec3;
  kneeR?: number;
  kneeL?: number;
}

type FullPose = Required<Pose>;

const BASE: FullPose = {
  hip: 0.5,
  ground: 1,
  pitch: 0,
  roll: 0,
  spine: [0, 0, 0],
  head: [0, 0, 0],
  armR: [0.04, 0, 0.09],
  armL: [0.04, 0, 0.09],
  elbowR: 0.2,
  elbowL: 0.2,
  legR: [0, 0, 0.02],
  legL: [0, 0, 0.02],
  kneeR: 0.04,
  kneeL: 0.04,
};

const pose = (p: Pose): FullPose => ({ ...BASE, ...p });

const lerp = THREE.MathUtils.lerp;
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => [
  lerp(a[0], b[0], u),
  lerp(a[1], b[1], u),
  lerp(a[2], b[2], u),
];

function lerpPose(a: FullPose, b: FullPose, u: number): FullPose {
  return {
    hip: lerp(a.hip, b.hip, u),
    ground: lerp(a.ground, b.ground, u),
    pitch: lerp(a.pitch, b.pitch, u),
    roll: lerp(a.roll, b.roll, u),
    spine: lerp3(a.spine, b.spine, u),
    head: lerp3(a.head, b.head, u),
    armR: lerp3(a.armR, b.armR, u),
    armL: lerp3(a.armL, b.armL, u),
    elbowR: lerp(a.elbowR, b.elbowR, u),
    elbowL: lerp(a.elbowL, b.elbowL, u),
    legR: lerp3(a.legR, b.legR, u),
    legL: lerp3(a.legL, b.legL, u),
    kneeR: lerp(a.kneeR, b.kneeR, u),
    kneeL: lerp(a.kneeL, b.kneeL, u),
  };
}

/** 手足。x=前後の振り、y=ひねり、z=外への開き。左は鏡にする。 */
function setLimb(node: THREE.Group, [x, y, z]: Vec3, side: number) {
  node.rotation.set(-x, side * y, side * z);
}

/**
 * 腰から足の裏までの垂直距離（身長比）。脚の長さは createFighter と揃えてある
 * （腿 0.24 + 膝から靴底 0.26）。膝は後ろに曲がるので、脛の角度は腿から膝の角度を引く。
 */
function footDrop([x, , z]: Vec3, knee: number): number {
  return (0.24 * Math.cos(x) + 0.26 * Math.cos(x - knee)) * Math.cos(z);
}

function applyPose(f: Fighter, p: FullPose) {
  // 立っている姿勢は、低い方の足が床に着く高さに腰を置く（膝を曲げれば沈む）。
  const grounded = Math.max(footDrop(p.legR, p.kneeR), footDrop(p.legL, p.kneeL));
  f.body.position.y = lerp(p.hip, grounded, p.ground) * f.height;
  f.body.rotation.set(p.pitch, 0, -p.roll);
  f.chest.rotation.set(p.spine[0], p.spine[1], -p.spine[2]);
  f.head.rotation.set(p.head[0], p.head[1], -p.head[2]);
  setLimb(f.shoulderR, p.armR, 1);
  setLimb(f.shoulderL, p.armL, -1);
  f.elbowR.rotation.x = -p.elbowR;
  f.elbowL.rotation.x = -p.elbowL;
  setLimb(f.hipR, p.legR, 1);
  setLimb(f.hipL, p.legL, -1);
  f.kneeR.rotation.x = p.kneeR;
  f.kneeL.rotation.x = p.kneeL;
}

// --- 姿勢の在庫 -------------------------------------------------------------
//
// 立っている姿勢は前かがみを `spine` で作り、腰の高さは脚の角度に任せる（`ground`）。
// 倒れる・飛ぶ姿勢だけ `ground: 0` にして、`pitch` で体ごと倒し `hip` で高さを決める。

/** 立ち。 */
const STAND = pose({});

/** 構え。腰を落として両手を前に。 */
const READY = pose({
  spine: [0.2, 0, 0],
  armR: [0.55, 0, 0.3],
  armL: [0.55, 0, 0.3],
  elbowR: 1.0,
  elbowL: 1.0,
  legR: [0.2, 0, 0.06],
  legL: [-0.2, 0, 0.06],
  kneeR: 0.45,
  kneeL: 0.4,
});

/** 組み合い（襟と肘を取る）。両腕を相手に伸ばす。 */
const LOCKUP = pose({
  spine: [0.34, 0, 0],
  armR: [1.15, 0, 0.34],
  armL: [1.25, 0, 0.2],
  elbowR: 0.55,
  elbowL: 0.4,
  legR: [0.3, 0, 0.08],
  legL: [-0.35, 0, 0.08],
  kneeR: 0.55,
  kneeL: 0.4,
  head: [0.12, 0, 0],
});

/** 組み合ったまま押し込む。より低く、体重を前に。 */
const LOCKUP_PUSH = pose({
  spine: [0.5, 0.1, 0],
  armR: [1.25, 0, 0.4],
  armL: [1.35, 0, 0.24],
  elbowR: 0.5,
  elbowL: 0.35,
  legR: [0.4, 0, 0.1],
  legL: [-0.5, 0, 0.1],
  kneeR: 0.8,
  kneeL: 0.35,
  head: [0.1, 0.1, 0],
});

/** 潜る。低く踏み込んで相手の脇へ入る。 */
const DUCK = pose({
  spine: [0.65, 0.2, 0],
  armR: [1.5, 0, 0.5],
  armL: [1.4, 0, 0.35],
  elbowR: 0.8,
  elbowL: 0.7,
  legR: [0.75, 0, 0.12],
  legL: [-0.15, 0, 0.12],
  kneeR: 1.35,
  kneeL: 1.0,
  head: [0.25, 0.2, 0],
});

/** 相手のバックを取って腰を抱える側。 */
const BACK_LOCK = pose({
  spine: [0.45, 0.1, 0],
  armR: [1.5, 0.35, 0.22],
  armL: [1.5, 0.35, 0.22],
  elbowR: 1.2,
  elbowL: 1.2,
  legR: [0.3, 0, 0.14],
  legL: [-0.3, 0, 0.14],
  kneeR: 0.7,
  kneeL: 0.5,
  head: [0.3, 0.15, 0],
});

/** バックを取られている側。腰を落として相手の腕を掻く。 */
const HELD = pose({
  spine: [0.42, 0, 0],
  armR: [0.6, -0.4, 0.55],
  armL: [0.6, -0.4, 0.55],
  elbowR: 1.5,
  elbowL: 1.5,
  legR: [0.25, 0, 0.16],
  legL: [-0.25, 0, 0.16],
  kneeR: 0.65,
  kneeL: 0.55,
  head: [0.2, 0, 0],
});

/** バックを取られたまま体をひねって外そうとする。 */
const HELD_TWIST = pose({
  spine: [0.48, 0.5, 0.15],
  armR: [1.0, -0.5, 0.8],
  armL: [0.4, -0.3, 0.4],
  elbowR: 1.6,
  elbowL: 1.3,
  legR: [0.35, 0, 0.18],
  legL: [-0.35, 0, 0.18],
  kneeR: 0.75,
  kneeL: 0.6,
  head: [0.1, 0.4, 0],
});

/** 肘で後ろの相手を外す。 */
const ELBOW_BACK = pose({
  spine: [0.12, -0.45, 0],
  armR: [-0.3, -0.6, 1.0],
  armL: [0.3, 0, 0.2],
  elbowR: 1.9,
  elbowL: 0.5,
  legR: [0.15, 0, 0.08],
  legL: [-0.15, 0, 0.08],
  kneeR: 0.3,
  kneeL: 0.25,
  head: [0, -0.5, 0],
});

/** 相手の腕を掴んでロープへ振る。 */
const WHIP = pose({
  spine: [0.25, 0.4, 0],
  armR: [1.3, 0.5, 0.5],
  armL: [0.4, 0, 0.3],
  elbowR: 0.4,
  elbowL: 0.9,
  legR: [0.4, 0, 0.08],
  legL: [-0.4, 0, 0.08],
  kneeR: 0.6,
  kneeL: 0.3,
});

/** 振られてよろける（後ろ向きに下がる）。 */
const STUMBLE = pose({
  spine: [-0.3, 0, 0],
  armR: [0.9, 0, 1.0],
  armL: [0.9, 0, 1.0],
  elbowR: 0.6,
  elbowL: 0.6,
  legR: [-0.45, 0, 0.12],
  legL: [0.45, 0, 0.12],
  kneeR: 0.3,
  kneeL: 0.75,
  head: [-0.2, 0, 0],
});

/** ロープを越えて場外へ落ちる途中。腰から後ろへ反る。 */
const OVER_ROPE = pose({
  ground: 0,
  hip: 0.34,
  pitch: -1.15,
  armR: [1.4, 0, 1.1],
  armL: [1.4, 0, 1.1],
  elbowR: 0.5,
  elbowL: 0.5,
  legR: [1.1, 0, 0.2],
  legL: [0.9, 0, 0.2],
  kneeR: 0.7,
  kneeL: 0.5,
  head: [-0.3, 0, 0],
});

/** 仰向けに伸びる（頭は `face` の反対側）。 */
const SUPINE = pose({
  ground: 0,
  hip: 0.09,
  pitch: -Math.PI / 2,
  armR: [-0.1, 0, 1.25],
  armL: [-0.1, 0, 1.15],
  elbowR: 0.35,
  elbowL: 0.3,
  legR: [0.18, 0, 0.14],
  legL: [0.14, 0, 0.16],
  kneeR: 0.3,
  kneeL: 0.22,
  head: [-0.2, 0.2, 0],
});

/** 仰向けで痛がる（少し丸まる）。 */
const SUPINE_HURT = pose({
  ground: 0,
  hip: 0.11,
  pitch: -Math.PI / 2 + 0.12,
  roll: 0.2,
  spine: [0.25, 0.2, 0],
  armR: [0.5, 0, 0.6],
  armL: [0.35, 0, 0.9],
  elbowR: 1.5,
  elbowL: 1.0,
  legR: [0.5, 0, 0.2],
  legL: [0.2, 0, 0.2],
  kneeR: 0.9,
  kneeL: 0.4,
  head: [-0.1, 0.3, 0],
});

/** うつ伏せ（頭は `face` の側）。 */
const PRONE = pose({
  ground: 0,
  hip: 0.09,
  pitch: Math.PI / 2,
  armR: [0.05, 0, 1.2],
  armL: [0.05, 0, 1.1],
  elbowR: 0.5,
  elbowL: 0.4,
  legR: [-0.12, 0, 0.14],
  legL: [-0.1, 0, 0.16],
  kneeR: 0.35,
  kneeL: 0.25,
  head: [0.2, -0.3, 0],
});

/** 上体を起こして座る。 */
const SIT_UP = pose({
  ground: 0,
  hip: 0.13,
  spine: [0.3, 0, 0],
  armR: [-0.6, 0, 0.5],
  armL: [-0.6, 0, 0.5],
  elbowR: 0.5,
  elbowL: 0.5,
  legR: [1.35, 0, 0.2],
  legL: [1.3, 0, 0.25],
  kneeR: 0.9,
  kneeL: 0.7,
  head: [0.15, 0, 0],
});

/** 片膝立ち（前の足は踏み、後ろの膝はマットにつく）。 */
const KNEEL = pose({
  spine: [0.25, 0, 0],
  armR: [0.7, 0, 0.35],
  armL: [0.15, 0, 0.2],
  elbowR: 1.1,
  elbowL: 0.4,
  legR: [1.5, 0, 0.12],
  legL: [-0.25, 0, 0.1],
  kneeR: 1.4,
  kneeL: 1.35,
  head: [0.15, 0, 0],
});

/** 歩き。走りより小さい歩幅で、腕は軽く振る。 */
const WALK_A = pose({
  spine: [0.1, 0, 0],
  armR: [-0.35, 0, 0.18],
  armL: [0.35, 0, 0.18],
  elbowR: 0.5,
  elbowL: 0.6,
  legR: [0.4, 0, 0.06],
  legL: [-0.35, 0, 0.06],
  kneeR: 0.35,
  kneeL: 0.5,
});
const WALK_B = pose({
  spine: [0.1, 0, 0],
  armR: [0.35, 0, 0.18],
  armL: [-0.35, 0, 0.18],
  elbowR: 0.6,
  elbowL: 0.5,
  legR: [-0.35, 0, 0.06],
  legL: [0.4, 0, 0.06],
  kneeR: 0.5,
  kneeL: 0.35,
});

/** 走り。踏み込む足を入れ替えた2つを交互に置く。 */
const RUN_A = pose({
  spine: [0.3, 0, 0],
  armR: [-0.9, 0, 0.2],
  armL: [1.0, 0, 0.2],
  elbowR: 1.5,
  elbowL: 1.6,
  legR: [0.75, 0, 0.06],
  legL: [-0.6, 0, 0.06],
  kneeR: 0.8,
  kneeL: 1.0,
  head: [0.1, 0, 0],
});
const RUN_B = pose({
  spine: [0.3, 0, 0],
  armR: [1.0, 0, 0.2],
  armL: [-0.9, 0, 0.2],
  elbowR: 1.6,
  elbowL: 1.5,
  legR: [-0.6, 0, 0.06],
  legL: [0.75, 0, 0.06],
  kneeR: 1.0,
  kneeL: 0.8,
  head: [0.1, 0, 0],
});

/** 踏み切り。低く沈んで両腕を振り上げる。 */
const TAKEOFF = pose({
  spine: [0.45, 0, 0],
  armR: [1.6, 0, 0.4],
  armL: [1.6, 0, 0.4],
  elbowR: 0.5,
  elbowL: 0.5,
  legR: [-0.9, 0, 0.06],
  legL: [1.0, 0, 0.06],
  kneeR: 0.5,
  kneeL: 1.25,
  head: [0.1, 0, 0],
});

/** トペ。体を水平にして両腕を前に伸ばす（頭は `face` の側）。 */
const DIVE = pose({
  ground: 0,
  hip: 0.09,
  pitch: Math.PI / 2 - 0.15,
  armR: [0.15, 0, 1.45],
  armL: [0.15, 0, 1.45],
  elbowR: 0.15,
  elbowL: 0.15,
  legR: [-0.35, 0, 0.16],
  legL: [-0.3, 0, 0.2],
  kneeR: 0.5,
  kneeL: 0.35,
  head: [0.35, 0, 0],
});

/** 相手を持ち上げる（ボディスラム）。腰を落として両腕を上げる。 */
const LIFT = pose({
  spine: [-0.2, 0, 0],
  armR: [1.5, 0, 0.65],
  armL: [1.5, 0, 0.65],
  elbowR: 0.9,
  elbowL: 0.9,
  legR: [0.3, 0, 0.16],
  legL: [-0.3, 0, 0.16],
  kneeR: 0.6,
  kneeL: 0.6,
  head: [-0.15, 0, 0],
});

/** 担ぎ上げられている側（水平、腕は垂れる）。 */
const LIFTED = pose({
  ground: 0,
  hip: 0.09,
  pitch: Math.PI / 2 + 0.1,
  roll: 0.15,
  armR: [-0.5, 0, 1.0],
  armL: [-0.6, 0, 0.9],
  elbowR: 0.7,
  elbowL: 0.6,
  legR: [-0.5, 0, 0.2],
  legL: [-0.45, 0, 0.22],
  kneeR: 0.7,
  kneeL: 0.6,
  head: [-0.3, 0, 0],
});

/** 叩きつけた直後。前のめりに腕を振り下ろす。 */
const SLAM = pose({
  spine: [0.6, 0, 0],
  armR: [1.0, 0, 0.45],
  armL: [1.0, 0, 0.45],
  elbowR: 0.3,
  elbowL: 0.3,
  legR: [0.45, 0, 0.18],
  legL: [-0.45, 0, 0.18],
  kneeR: 0.8,
  kneeL: 0.5,
  head: [0.35, 0, 0],
});

/** フォール（相手に覆いかぶさる）。 */
const COVER = pose({
  ground: 0,
  hip: 0.11,
  pitch: Math.PI / 2 - 0.1,
  armR: [0.2, 0, 1.3],
  armL: [0.9, 0, 0.9],
  elbowR: 0.3,
  elbowL: 1.4,
  // 相手にかぶさっているので、脚はマットに投げ出す（曲げると宙に浮く）。
  legR: [0.05, 0, 0.32],
  legL: [0.02, 0, 0.38],
  kneeR: 0.2,
  kneeL: 0.15,
  head: [0.3, 0.4, 0],
});

/** フォールを返す（肩を上げる）。 */
const KICK_OUT = pose({
  ground: 0,
  hip: 0.14,
  pitch: -Math.PI / 2 + 0.35,
  roll: -0.35,
  spine: [0.3, -0.3, 0],
  armR: [0.9, 0, 0.7],
  armL: [-0.2, 0, 1.2],
  elbowR: 0.8,
  elbowL: 0.4,
  legR: [0.7, 0, 0.2],
  legL: [0.25, 0, 0.2],
  kneeR: 1.1,
  kneeL: 0.4,
  head: [-0.1, -0.2, 0],
});

/** ラリアット。腕を横に振り抜く。 */
const LARIAT = pose({
  spine: [0.15, -0.55, 0],
  armR: [0.4, -0.9, 1.5],
  armL: [-0.3, 0, 0.5],
  elbowR: 0.15,
  elbowL: 0.6,
  legR: [0.5, 0, 0.1],
  legL: [-0.5, 0, 0.1],
  kneeR: 0.7,
  kneeL: 0.35,
  head: [0, -0.3, 0],
});

/** 打たれて宙で反る。 */
const FLIP_BACK = pose({
  ground: 0,
  hip: 0.3,
  pitch: -1.3,
  armR: [1.5, 0, 1.0],
  armL: [1.5, 0, 1.0],
  elbowR: 0.3,
  elbowL: 0.3,
  legR: [1.3, 0, 0.2],
  legL: [1.1, 0, 0.25],
  kneeR: 0.6,
  kneeL: 0.4,
  head: [-0.4, 0, 0],
});

/** 相手を後ろから抱えて反り投げる側（ジャーマン／バックドロップ）。 */
const SUPLEX_LIFT = pose({
  pitch: -0.25,
  spine: [-0.55, 0, 0],
  armR: [1.7, 0.3, 0.3],
  armL: [1.7, 0.3, 0.3],
  elbowR: 1.0,
  elbowL: 1.0,
  legR: [0.35, 0, 0.2],
  legL: [-0.1, 0, 0.2],
  kneeR: 0.6,
  kneeL: 0.5,
  head: [-0.5, 0, 0],
});

/** 反り投げられている側（垂直に持ち上げられて後ろへ）。 */
const SUPLEX_HELD = pose({
  ground: 0,
  hip: 0.5,
  pitch: -1.0,
  armR: [-0.6, 0, 1.3],
  armL: [-0.6, 0, 1.3],
  elbowR: 0.3,
  elbowL: 0.3,
  legR: [-0.5, 0, 0.2],
  legL: [-0.4, 0, 0.25],
  kneeR: 0.4,
  kneeL: 0.3,
  head: [-0.3, 0, 0],
});

/** 首から落ちて足が上がった状態。 */
const DUMPED = pose({
  ground: 0,
  hip: 0.2,
  pitch: -Math.PI / 2 - 0.5,
  roll: 0.25,
  armR: [-0.3, 0, 1.1],
  armL: [-0.4, 0, 1.0],
  elbowR: 0.5,
  elbowL: 0.4,
  legR: [-0.6, 0, 0.25],
  legL: [-0.5, 0, 0.3],
  kneeR: 0.8,
  kneeL: 0.6,
  head: [0.2, 0, 0],
});

/** 前腕で打つ（右）。 */
const STRIKE = pose({
  spine: [0.28, -0.4, 0],
  armR: [1.3, -0.3, 0.6],
  armL: [-0.2, 0, 0.4],
  elbowR: 1.0,
  elbowL: 0.7,
  legR: [0.4, 0, 0.1],
  legL: [-0.4, 0, 0.1],
  kneeR: 0.6,
  kneeL: 0.3,
  head: [0.1, -0.2, 0],
});

/** 打たれてのけぞる。 */
const STAGGER = pose({
  spine: [-0.35, 0.3, 0.2],
  armR: [0.3, 0, 0.9],
  armL: [0.6, 0, 0.7],
  elbowR: 1.2,
  elbowL: 1.0,
  legR: [-0.3, 0, 0.14],
  legL: [0.3, 0, 0.14],
  kneeR: 0.25,
  kneeL: 0.6,
  head: [-0.35, 0.2, 0],
});

/** 勝ち名乗り（腕を上げられる）。 */
const ARM_UP = pose({
  spine: [-0.05, 0, 0],
  armR: [0.15, 0, 0.35],
  armL: [0.2, 0, 2.6],
  elbowR: 0.3,
  elbowL: 0.1,
  legR: [0.1, 0, 0.08],
  legL: [-0.1, 0, 0.08],
  head: [-0.1, 0, 0],
});

/** 両手を突き上げる。 */
const CELEBRATE = pose({
  spine: [-0.12, 0, 0],
  armR: [0.3, 0, 2.5],
  armL: [0.3, 0, 2.5],
  elbowR: 0.25,
  elbowL: 0.25,
  legR: [0.12, 0, 0.14],
  legL: [-0.12, 0, 0.14],
  kneeR: 0.1,
  kneeL: 0.1,
  head: [-0.15, 0, 0],
});

// --- レフェリー -------------------------------------------------------------

/** 見守る（軽く腰を落として構える）。 */
const REF_WATCH = pose({
  spine: [0.16, 0, 0],
  armR: [0.3, 0, 0.35],
  armL: [0.3, 0, 0.35],
  elbowR: 0.8,
  elbowL: 0.8,
  legR: [0.12, 0, 0.08],
  legL: [-0.12, 0, 0.08],
  kneeR: 0.3,
  kneeL: 0.25,
});

/** 腰を落として組み合いを覗き込む。 */
const REF_CROUCH = pose({
  spine: [0.55, 0, 0],
  armR: [0.6, 0, 0.5],
  armL: [0.5, 0, 0.45],
  elbowR: 1.2,
  elbowL: 1.1,
  legR: [0.5, 0, 0.2],
  legL: [-0.2, 0, 0.2],
  kneeR: 1.1,
  kneeL: 0.8,
  head: [0.3, 0, 0],
});

/** ロープ越しに場外を覗く。 */
const REF_LEAN = pose({
  spine: [0.45, 0, 0],
  armR: [1.2, 0, 0.7],
  armL: [0.4, 0, 0.4],
  elbowR: 0.6,
  elbowL: 0.9,
  legR: [0.35, 0, 0.12],
  legL: [-0.35, 0, 0.12],
  kneeR: 0.55,
  kneeL: 0.3,
  head: [0.35, 0, 0],
});

/** 場外カウント。腕を振り上げる／振り下ろす。 */
const REF_COUNT_UP = pose({
  spine: [0.2, 0, 0],
  armR: [2.5, 0, 0.45],
  armL: [0.3, 0, 0.35],
  elbowR: 0.25,
  elbowL: 0.8,
  legR: [0.2, 0, 0.1],
  legL: [-0.2, 0, 0.1],
  kneeR: 0.35,
  kneeL: 0.3,
  head: [0.1, 0, 0],
});
const REF_COUNT_DOWN = pose({
  spine: [0.32, 0, 0],
  armR: [1.0, 0, 0.4],
  armL: [0.3, 0, 0.35],
  elbowR: 0.6,
  elbowL: 0.8,
  legR: [0.2, 0, 0.1],
  legL: [-0.2, 0, 0.1],
  kneeR: 0.4,
  kneeL: 0.35,
  head: [0.2, 0, 0],
});

/** フォールのカウント。片膝をついて、右手を振り上げる／マットを叩く。 */
const REF_PIN_UP = pose({
  spine: [0.3, 0, 0],
  armR: [2.4, 0, 0.3],
  armL: [0.4, 0, 0.3],
  elbowR: 0.35,
  elbowL: 0.9,
  legR: [1.5, 0, 0.12],
  legL: [-0.25, 0, 0.1],
  kneeR: 1.4,
  kneeL: 1.35,
  head: [0.35, 0, 0],
});
const REF_PIN_SLAP = pose({
  spine: [0.72, 0, 0],
  armR: [0.12, 0, 0.28],
  armL: [0.4, 0, 0.3],
  elbowR: 0.15,
  elbowL: 0.9,
  legR: [1.5, 0, 0.12],
  legL: [-0.25, 0, 0.1],
  kneeR: 1.45,
  kneeL: 1.4,
  head: [0.45, 0, 0],
});

/** 両手を横に振る（カウントの中断／ゴングの合図）。 */
const REF_WAVE = pose({
  spine: [0.05, 0, 0],
  armR: [0.2, 0, 1.5],
  armL: [0.2, 0, 1.5],
  elbowR: 0.15,
  elbowL: 0.15,
  legR: [0.15, 0, 0.12],
  legL: [-0.15, 0, 0.12],
  kneeR: 0.2,
  kneeL: 0.2,
});

/** 勝者の腕を取って上げる。 */
const REF_RAISE = pose({
  spine: [-0.05, 0, 0],
  armR: [0.25, 0, 2.55],
  armL: [0.2, 0, 0.35],
  elbowR: 0.15,
  elbowL: 0.35,
  legR: [0.1, 0, 0.1],
  legL: [-0.1, 0, 0.1],
  head: [-0.1, 0, 0],
});

/** セコンド。リング中央を向いて片膝をついて待機する。 */
const SECOND_KNEEL = pose({
  spine: [0.22, 0, 0],
  armR: [0.75, 0, 0.3],
  armL: [0.2, 0, 0.22],
  elbowR: 1.25,
  elbowL: 0.55,
  legR: [1.5, 0, 0.14],
  legL: [-0.25, 0, 0.1],
  kneeR: 1.42,
  kneeL: 1.33,
  head: [0.1, 0, 0],
});

// ---------------------------------------------------------------------------
// 立ち位置とキーフレーム
// ---------------------------------------------------------------------------

/** 床の上の位置と向き。`face` は rotation.y と同じで、0 で +Z（南）を向く。 */
interface Spot {
  x: number;
  z: number;
  face: number;
}

const spot = (x: number, z: number, face: number): Spot => ({ x, z, face });

/** s の正面へ d だけ進んだ位置（d が負なら背中側）。向きはそのまま。 */
const ahead = (s: Spot, d: number): Spot => ({
  x: s.x + Math.sin(s.face) * d,
  z: s.z + Math.cos(s.face) * d,
  face: s.face,
});

/** s の正面 d の位置で、s と向かい合う。 */
const facing = (s: Spot, d: number): Spot => ({ ...ahead(s, d), face: s.face + Math.PI });

/** s の背中側 d の位置で、s と同じ向き（バックを取った位置）。 */
const behind = (s: Spot, d: number): Spot => ahead(s, -d);

/** from から to を向く角度。 */
const look = (from: { x: number; z: number }, to: { x: number; z: number }) =>
  Math.atan2(to.x - from.x, to.z - from.z);

/** 位置はそのままで向きだけ変える。 */
const turned = (s: Spot, face: number): Spot => ({ ...s, face });

interface Key {
  t: number;
  at: Spot;
  pose: FullPose;
  /** 立っている床の高さ。既定はリングのマット面。 */
  y?: number;
  /** この区間を放物線で飛ぶ（頂点でこの高さぶん浮く）。 */
  arc?: number;
  /** 補間の効き方。既定は緩急をつける。 */
  ease?: 'linear' | 'in' | 'out';
}

function easeAmount(u: number, kind: Key['ease']): number {
  switch (kind) {
    case 'linear':
      return u;
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    default:
      return u * u * (3 - 2 * u);
  }
}

/** t の時点の姿勢を作って人形に流し込む。 */
function applyTrack(f: Fighter, keys: Key[], t: number) {
  let i = keys.length - 1;
  while (i > 0 && keys[i].t > t) i--;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = b.t - a.t;
  const u = span > 0 ? easeAmount(THREE.MathUtils.clamp((t - a.t) / span, 0, 1), b.ease) : 0;

  const ay = a.y ?? MAT;
  const by = b.y ?? MAT;
  const arc = b.arc ? b.arc * 4 * u * (1 - u) : 0;

  f.root.position.set(
    lerp(a.at.x, b.at.x, u),
    lerp(ay, by, u) + arc,
    lerp(a.at.z, b.at.z, u),
  );
  // 向きは近い方に回す（π を跨いでも一周しない）。
  let delta = (b.at.face - a.at.face) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  f.root.rotation.y = a.at.face + delta * u;

  applyPose(f, lerpPose(a.pose, b.pose, u));
}

// ---------------------------------------------------------------------------
// 振り付け
// ---------------------------------------------------------------------------

/*
 * 秒数のあらすじ:
 *   0- 13  組み合ってバックの取り合い（アマレス）
 *  13- 17  ロープに振ってBを場外へ落とす
 *  17- 23  Aが助走してノータッチのトペコンヒーロ
 *  23- 30  場外から起き上がってリングへ戻す
 *  30- 36  ボディスラム → カバー → 2カウントで返される
 *  36- 43  Bの切り返し（ラリアット・バックドロップ）
 *  43- 49  打ち合い → Aのジャーマンスープレックス
 *  49- 55  フォールとスリーカウント
 *  55- 60  勝ち名乗りのあと、構え直して先頭へ戻る
 */

// 組み合いの位置。相手側のキーは必ずこの定数から導く（別々に置くとズレる）。
const CENTER_A = spot(-0.75, 0.5, look({ x: -0.75, z: 0.5 }, { x: 0.7, z: -0.3 }));
const CENTER_B = spot(0.7, -0.3, look({ x: 0.7, z: -0.3 }, { x: -0.75, z: 0.5 }));
/** 組んだ瞬間（腕1本ぶんの距離）。 */
const LOCK_A = ahead(CENTER_A, 0.55);
const LOCK_B = facing(LOCK_A, 0.95);
/** 押し合って半周ぶん回った位置。 */
const TURN_B = spot(0.15, -0.55, 2.5);
const TURN_A = facing(TURN_B, 0.95);
/** Aが潜って横に流れる。 */
const DUCK_A = spot(0.55, -0.15, 2.2);
/** Aがバックを取った（Bの背中側 0.52m）。 */
const LOCKED_B = spot(0.3, -0.35, -1.35);
const LOCKED_A = { ...behind(LOCKED_B, 0.52), face: LOCKED_B.face };
/** そのまま押して運ぶ。 */
const DRIVE_B = ahead(LOCKED_B, 0.85);
const DRIVE_A = { ...behind(DRIVE_B, 0.52), face: DRIVE_B.face };
/** Bが振りほどいて逆にバックを取る。 */
const REV_A = turned(DRIVE_B, DRIVE_B.face + 0.5);
const REV_B = { ...behind(REV_A, 0.52), face: REV_A.face };
/** 肘で外して離れる。 */
const BREAK_A = spot(-0.6, 0.15, 0.6);
const BREAK_B = spot(0.35, 1.1, look({ x: 0.35, z: 1.1 }, BREAK_A));

// ロープに振って場外へ。南（+Z）のロープ際で落とす。
const WHIP_A = spot(-0.35, 0.35, look({ x: -0.35, z: 0.35 }, { x: 0.25, z: 1.2 }));
const WHIP_B = spot(0.25, 1.2, WHIP_A.face + Math.PI);
/** ロープに当たる位置（マットの南端）。 */
const ROPE_B = spot(0.15, 2.85, 0.1);
/** ロープを越えて宙にいるところ。 */
const FLY_B = spot(0.12, 3.5, 0.05);
/** 場外の着地点（寝ているので腰の位置）。 */
const DOWN_B = spot(0.1, 4.15, 0);

// トペコンヒーロ。北側から助走して、南のトップロープを越える。
const CORNER_A = spot(0.02, -2.5, 0.05);
const RUN_MID = spot(0.04, -0.6, 0.05);
const RUN_END = spot(0.05, 1.7, 0.05);
const JUMP_A = spot(0.06, 2.2, 0.05);
/** トップロープ(マット面から1.41m)の真上。ロープに触らずに越える高さを取る。 */
const APEX_A = spot(0.08, 3.1, 0.05);
/** 着地。Bの上に重なる（うつ伏せで腰の位置）。 */
const LAND_A = spot(0.14, 4.1, 0.05);
/** 潰されたBは少し南へずれる。 */
const CRUSH_B = spot(0.05, 4.35, 0);

// 場外からリングへ。
const OUT_A = spot(0.75, 3.95, look({ x: 0.75, z: 3.95 }, { x: 0.1, z: 4.2 }));
const ROLLIN_B = spot(0.2, 2.6, 0);
/** エプロンの外側。ここまでは床、ここから上がってリングイン（幕を突き抜けないように）。 */
const STEP_A = spot(0.85, 3.55, Math.PI);
const APRON_A = spot(0.85, 3.28, Math.PI);
const IN_A = spot(0.7, 2.2, Math.PI);

// ボディスラム。
const SLAM_A = spot(0.35, 1.35, look({ x: 0.35, z: 1.35 }, { x: 0.3, z: 0.55 }));
const SLAM_B = facing(SLAM_A, 0.7);
/** 担ぎ上げたBはAの少し前・頭上に来る。 */
const HELD_B = { ...ahead(SLAM_A, 0.35), face: SLAM_A.face + Math.PI / 2 };
/** 叩きつけた先（Bの腰の位置）。 */
const DOWN2_B = spot(0.25, 0.35, SLAM_A.face + Math.PI / 2);
/** カバー。Bの胸を横切って重なる。 */
const COVER_A = spot(0.05, 0.3, SLAM_A.face);

// 切り返し。Bのラリアットと投げっぱなしのバックドロップ。
const UP_A = spot(-0.2, 1.05, look({ x: -0.2, z: 1.05 }, { x: 0.9, z: 0.2 }));
const UP_B = spot(0.9, 0.2, look({ x: 0.9, z: 0.2 }, { x: -0.2, z: 1.05 }));
const CHARGE_A = spot(0.35, 0.6, UP_A.face);
const HIT_A = spot(0.55, 0.42, UP_A.face);
const BLOWN_A = spot(0.1, 0.95, UP_B.face + Math.PI);
/** バックドロップ。BがAの後ろから抱える。 */
const BD_A = spot(-0.1, 0.1, 1.9);
const BD_B = { ...behind(BD_A, 0.5), face: BD_A.face };
/** 反ったときのAの腰の位置（Bの頭上を越えて後ろへ）。 */
const BD_FLY = { ...ahead(BD_B, -0.3), face: BD_A.face };
const BD_DOWN_A = { ...behind(BD_B, 0.75), face: BD_A.face + Math.PI };
const BD_SIT_B = { ...behind(BD_B, 0.1), face: BD_A.face };

// 打ち合いとジャーマン。
const TRADE_A = spot(-0.45, -0.35, look({ x: -0.45, z: -0.35 }, { x: 0.5, z: -0.9 }));
const TRADE_B = spot(0.5, -0.9, look({ x: 0.5, z: -0.9 }, { x: -0.45, z: -0.35 }));
const GERMAN_B = turned(TRADE_B, TRADE_B.face + 2.6);
const GERMAN_A = { ...behind(GERMAN_B, 0.5), face: GERMAN_B.face };
/** 反り投げられたBは、Aの頭を越えて後ろに落ちる。 */
const GERMAN_FLY = { ...ahead(GERMAN_A, -0.35), face: GERMAN_B.face };
const GERMAN_DOWN_B = { ...behind(GERMAN_A, 0.85), face: GERMAN_B.face + Math.PI };
const GERMAN_SIT_A = { ...behind(GERMAN_A, 0.15), face: GERMAN_B.face };
/** 決めのフォール。 */
const PIN_B = turned(GERMAN_DOWN_B, GERMAN_B.face + Math.PI);
const PIN_A = { x: PIN_B.x - 0.28, z: PIN_B.z + 0.05, face: PIN_B.face + Math.PI / 2 };
/** レフェリーがカウントを数える位置（フォールしている側とは反対の東側）。 */
const PIN_COUNT = { x: PIN_B.x + 0.95, z: PIN_B.z - 0.75, face: look({ x: PIN_B.x + 0.95, z: PIN_B.z - 0.75 }, PIN_B) };

/** 勝ち名乗り。レフェリーは勝者の左隣に立つ。 */
const WIN_A = spot(-0.2, -0.6, 0.9);
const WIN_REF = { x: WIN_A.x - 0.62, z: WIN_A.z - 0.12, face: WIN_A.face };

/** 金髪のレスラー（この試合の勝者）。 */
function trackA(): Key[] {
  return [
    { t: 0, at: CENTER_A, pose: READY },
    { t: 1.7, at: LOCK_A, pose: LOCKUP },
    { t: 3.4, at: TURN_A, pose: LOCKUP_PUSH },
    { t: 4.6, at: DUCK_A, pose: DUCK },
    { t: 5.6, at: LOCKED_A, pose: BACK_LOCK },
    { t: 7.6, at: DRIVE_A, pose: BACK_LOCK },
    { t: 9.2, at: REV_A, pose: HELD },
    { t: 10.6, at: REV_A, pose: HELD_TWIST },
    { t: 11.8, at: turned(REV_A, REV_A.face - 0.3), pose: ELBOW_BACK, ease: 'in' },
    { t: 13.0, at: BREAK_A, pose: READY },
    { t: 14.0, at: WHIP_A, pose: LOCKUP },
    { t: 14.9, at: WHIP_A, pose: WHIP, ease: 'in' },
    // Bが場外に落ちるのを見送って、北側のコーナーまで下がる。
    { t: 16.4, at: turned(WHIP_A, look(WHIP_A, ROPE_B)), pose: STAND },
    { t: 17.5, at: spot(0.05, 0.1, 0.05 + Math.PI), pose: WALK_A },
    { t: 18.6, at: CORNER_A, pose: WALK_B },
    { t: 19.6, at: CORNER_A, pose: READY },
    // ノータッチのトペコンヒーロ。ロープに触らずトップロープを越える。
    { t: 20.4, at: RUN_MID, pose: RUN_A, ease: 'in' },
    { t: 20.9, at: RUN_END, pose: RUN_B, ease: 'linear' },
    { t: 21.2, at: JUMP_A, pose: TAKEOFF, ease: 'linear' },
    { t: 21.85, at: APEX_A, y: MAT + 1.75, pose: DIVE, ease: 'out' },
    { t: 22.5, at: LAND_A, y: FLOOR + 0.42, pose: DIVE, ease: 'in' },
    { t: 23.2, at: LAND_A, y: FLOOR + 0.3, pose: PRONE },
    { t: 25.0, at: spot(0.55, 3.95, 0.6), y: FLOOR, pose: PRONE },
    { t: 26.4, at: spot(0.7, 3.95, look({ x: 0.7, z: 3.95 }, DOWN_B)), y: FLOOR, pose: KNEEL },
    { t: 27.4, at: OUT_A, y: FLOOR, pose: REF_CROUCH },
    // Bをリングに戻してから自分も入る。
    { t: 28.6, at: OUT_A, y: FLOOR, pose: SLAM },
    { t: 29.4, at: STEP_A, y: FLOOR, pose: STAND },
    { t: 30.2, at: APRON_A, pose: KNEEL },
    { t: 30.9, at: IN_A, pose: KNEEL },
    { t: 31.4, at: SLAM_A, pose: STAND },
    // ボディスラム。
    { t: 31.8, at: SLAM_A, pose: LOCKUP },
    { t: 32.6, at: SLAM_A, pose: LIFT, ease: 'out' },
    { t: 33.4, at: SLAM_A, pose: LIFT },
    { t: 33.9, at: SLAM_A, pose: SLAM, ease: 'in' },
    // カバー。2カウントで返される。
    { t: 34.6, at: COVER_A, y: MAT + 0.26, pose: COVER },
    { t: 36.0, at: COVER_A, y: MAT + 0.26, pose: COVER },
    { t: 36.6, at: spot(-0.35, 0.75, 1.2), pose: PRONE },
    { t: 37.6, at: UP_A, pose: STAGGER },
    // 走り込んでラリアットを食う。
    { t: 38.4, at: CHARGE_A, pose: RUN_A, ease: 'in' },
    { t: 38.9, at: HIT_A, pose: RUN_B, ease: 'linear' },
    { t: 39.3, at: HIT_A, y: MAT + 0.35, pose: FLIP_BACK, ease: 'out' },
    { t: 39.9, at: BLOWN_A, pose: SUPINE, ease: 'in' },
    { t: 41.0, at: BLOWN_A, pose: SUPINE_HURT },
    // バックドロップで投げられる。
    { t: 41.8, at: BD_A, pose: STAGGER },
    { t: 42.4, at: BD_A, pose: HELD },
    { t: 43.0, at: BD_FLY, y: MAT + 0.85, pose: SUPLEX_HELD, ease: 'out' },
    { t: 43.6, at: BD_DOWN_A, pose: DUMPED, ease: 'in' },
    { t: 44.4, at: BD_DOWN_A, pose: SUPINE_HURT },
    { t: 45.4, at: TRADE_A, pose: STAND },
    // 前腕の打ち合い。打って、打たれて、また打つ。
    { t: 46.0, at: TRADE_A, pose: STRIKE, ease: 'in' },
    { t: 46.5, at: TRADE_A, pose: STAGGER, ease: 'in' },
    { t: 47.0, at: TRADE_A, pose: STRIKE, ease: 'in' },
    // 潜ってバックを取り、ジャーマンスープレックス。
    { t: 47.6, at: GERMAN_A, pose: DUCK },
    { t: 48.2, at: GERMAN_A, pose: BACK_LOCK },
    { t: 48.8, at: GERMAN_A, pose: SUPLEX_LIFT, ease: 'out' },
    { t: 49.4, at: GERMAN_SIT_A, pose: SIT_UP, ease: 'in' },
    // フォールしてスリーカウント。
    { t: 50.4, at: PIN_A, y: MAT + 0.26, pose: COVER },
    { t: 53.6, at: PIN_A, y: MAT + 0.26, pose: COVER },
    { t: 54.6, at: turned(PIN_A, PIN_A.face + 0.6), pose: KNEEL },
    { t: 55.6, at: WIN_A, pose: CELEBRATE },
    { t: 56.6, at: WIN_A, pose: ARM_UP },
    { t: 57.6, at: WIN_A, pose: ARM_UP },
    { t: 58.4, at: turned(WIN_A, look(WIN_A, CENTER_A)), pose: WALK_A },
    { t: 59.3, at: spot(-0.75, 0.05, look({ x: -0.75, z: 0.05 }, CENTER_B)), pose: WALK_B },
    { t: 60, at: CENTER_A, pose: READY },
  ];
}

/** 黒髪のレスラー。 */
function trackB(): Key[] {
  return [
    { t: 0, at: CENTER_B, pose: READY },
    { t: 1.7, at: LOCK_B, pose: LOCKUP },
    { t: 3.4, at: TURN_B, pose: LOCKUP },
    { t: 4.6, at: turned(TURN_B, TURN_B.face - 0.9), pose: LOCKUP_PUSH },
    { t: 5.6, at: LOCKED_B, pose: HELD },
    { t: 7.6, at: DRIVE_B, pose: HELD },
    { t: 8.4, at: DRIVE_B, pose: HELD_TWIST },
    { t: 9.2, at: REV_B, pose: BACK_LOCK },
    { t: 11.2, at: REV_B, pose: BACK_LOCK },
    { t: 11.8, at: REV_B, pose: STAGGER, ease: 'in' },
    { t: 13.0, at: BREAK_B, pose: READY },
    { t: 14.0, at: WHIP_B, pose: HELD },
    // ロープに振られ、勢い余ってトップロープを越えて場外へ。
    { t: 15.3, at: ROPE_B, pose: STUMBLE, ease: 'linear' },
    { t: 15.9, at: FLY_B, y: MAT + 0.55, pose: OVER_ROPE, ease: 'out' },
    { t: 16.8, at: DOWN_B, y: FLOOR, pose: SUPINE, ease: 'in' },
    { t: 18.5, at: DOWN_B, y: FLOOR, pose: SUPINE_HURT },
    { t: 20.2, at: DOWN_B, y: FLOOR, pose: SIT_UP },
    { t: 21.4, at: turned(DOWN_B, Math.PI), y: FLOOR, pose: KNEEL },
    // トペを浴びて吹き飛ぶ。
    { t: 22.5, at: turned(DOWN_B, Math.PI), y: FLOOR, pose: KNEEL },
    { t: 22.9, at: CRUSH_B, y: FLOOR, pose: SUPINE, ease: 'in' },
    { t: 25.6, at: CRUSH_B, y: FLOOR, pose: SUPINE_HURT },
    // 転がされてリングイン。
    { t: 27.4, at: spot(0.15, 3.9, 0), y: FLOOR, pose: SUPINE },
    { t: 28.6, at: spot(0.18, 3.2, 0), y: MAT, pose: PRONE, ease: 'out' },
    { t: 29.6, at: ROLLIN_B, pose: SUPINE },
    { t: 31.4, at: ROLLIN_B, pose: SUPINE_HURT },
    // 引き起こされてボディスラム。
    { t: 31.9, at: SLAM_B, pose: STAGGER },
    { t: 32.6, at: HELD_B, y: MAT + 0.85, pose: LIFTED, ease: 'out' },
    { t: 33.4, at: HELD_B, y: MAT + 0.92, pose: LIFTED },
    { t: 33.9, at: DOWN2_B, pose: SUPINE, ease: 'in' },
    { t: 34.6, at: DOWN2_B, pose: SUPINE },
    // 2カウントで肩を上げる。
    { t: 35.9, at: DOWN2_B, pose: SUPINE },
    { t: 36.2, at: DOWN2_B, pose: KICK_OUT, ease: 'in' },
    { t: 37.0, at: DOWN2_B, pose: SIT_UP },
    { t: 37.8, at: UP_B, pose: STAND },
    // ラリアットで迎え撃つ。
    { t: 38.6, at: UP_B, pose: READY },
    { t: 38.9, at: UP_B, pose: LARIAT, ease: 'in' },
    { t: 39.6, at: UP_B, pose: LARIAT },
    // 後ろから抱えてバックドロップ。
    { t: 41.2, at: turned(BD_B, BD_B.face), pose: STAND },
    { t: 42.4, at: BD_B, pose: BACK_LOCK },
    { t: 43.0, at: BD_B, pose: SUPLEX_LIFT, ease: 'out' },
    { t: 43.6, at: BD_SIT_B, pose: SIT_UP, ease: 'in' },
    { t: 44.6, at: BD_SIT_B, pose: KNEEL },
    { t: 45.4, at: TRADE_B, pose: STAND },
    // 打ち合い。Aの打撃を受けてから、打ち返す。
    { t: 46.0, at: TRADE_B, pose: STAGGER, ease: 'in' },
    { t: 46.5, at: TRADE_B, pose: STRIKE, ease: 'in' },
    { t: 47.0, at: TRADE_B, pose: STAGGER, ease: 'in' },
    { t: 47.6, at: GERMAN_B, pose: STAGGER },
    { t: 48.2, at: GERMAN_B, pose: HELD },
    { t: 48.8, at: GERMAN_FLY, y: MAT + 0.95, pose: SUPLEX_HELD, ease: 'out' },
    { t: 49.4, at: GERMAN_DOWN_B, pose: DUMPED, ease: 'in' },
    { t: 50.0, at: PIN_B, pose: SUPINE },
    { t: 53.6, at: PIN_B, pose: SUPINE },
    { t: 55.0, at: PIN_B, pose: SUPINE_HURT },
    { t: 56.6, at: turned(PIN_B, PIN_B.face), pose: SIT_UP },
    { t: 57.8, at: spot(0.9, 0.2, look({ x: 0.9, z: 0.2 }, CENTER_B)), pose: KNEEL },
    { t: 58.6, at: spot(0.9, 0.2, look({ x: 0.9, z: 0.2 }, CENTER_B)), pose: WALK_A },
    { t: 59.3, at: spot(0.85, -0.05, look({ x: 0.85, z: -0.05 }, CENTER_A)), pose: WALK_B },
    { t: 60, at: CENTER_B, pose: READY },
  ];
}

/** レフェリー。2人の周りを回り、フォールを数える。 */
function trackRef(): Key[] {
  /** その位置から組み合いを見る向き。 */
  const watch = (x: number, z: number, at: { x: number; z: number }) =>
    spot(x, z, look({ x, z }, at));

  return [
    { t: 0, at: watch(2.05, 1.75, CENTER_B), pose: REF_WATCH },
    { t: 3.4, at: watch(2.3, -0.3, TURN_B), pose: REF_WATCH },
    { t: 5.6, at: watch(1.6, -1.85, LOCKED_B), pose: REF_CROUCH },
    { t: 8.0, at: watch(-1.05, -1.95, DRIVE_B), pose: REF_CROUCH },
    { t: 11.0, at: watch(-1.75, -0.7, REV_A), pose: REF_WATCH },
    { t: 13.4, at: watch(-1.85, 0.9, BREAK_B), pose: REF_WATCH },
    // Bが場外に落ちたのでロープ際へ。場外カウントを取り始める。
    { t: 16.2, at: spot(-1.35, 2.35, 0.35), pose: REF_LEAN },
    { t: 17.6, at: spot(-1.35, 2.35, 0.35), pose: REF_COUNT_UP },
    { t: 18.0, at: spot(-1.35, 2.35, 0.35), pose: REF_COUNT_DOWN, ease: 'in' },
    { t: 18.6, at: spot(-1.35, 2.35, 0.35), pose: REF_COUNT_UP },
    { t: 19.0, at: spot(-1.35, 2.35, 0.35), pose: REF_COUNT_DOWN, ease: 'in' },
    // Aが助走してくるので飛ぶ線から離れる。
    { t: 20.6, at: spot(-2.15, 1.5, 0.8), pose: REF_WATCH },
    { t: 22.8, at: spot(-1.75, 2.3, 0.25), pose: REF_LEAN },
    { t: 23.8, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_UP },
    { t: 24.2, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_DOWN, ease: 'in' },
    { t: 24.8, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_UP },
    { t: 25.2, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_DOWN, ease: 'in' },
    { t: 25.8, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_UP },
    { t: 26.2, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_DOWN, ease: 'in' },
    { t: 26.8, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_UP },
    { t: 27.2, at: spot(-1.75, 2.3, 0.25), pose: REF_COUNT_DOWN, ease: 'in' },
    { t: 28.6, at: spot(-1.5, 2.2, 0.2), pose: REF_LEAN },
    { t: 30.4, at: watch(-1.3, 1.5, SLAM_A), pose: REF_WATCH },
    { t: 33.4, at: watch(-1.2, 0.55, SLAM_A), pose: REF_WATCH },
    // ボディスラムのあとのカバーを数える。2で返される。
    { t: 34.5, at: watch(-1.0, -0.15, DOWN2_B), pose: REF_PIN_UP },
    { t: 34.9, at: watch(-1.0, -0.15, DOWN2_B), pose: REF_PIN_SLAP, ease: 'in' },
    { t: 35.4, at: watch(-1.0, -0.15, DOWN2_B), pose: REF_PIN_UP },
    { t: 35.8, at: watch(-1.0, -0.15, DOWN2_B), pose: REF_PIN_SLAP, ease: 'in' },
    { t: 36.2, at: watch(-1.0, -0.15, DOWN2_B), pose: REF_PIN_UP },
    { t: 36.8, at: watch(-1.2, -0.3, DOWN2_B), pose: REF_WAVE },
    { t: 38.4, at: watch(1.75, -0.55, UP_B), pose: REF_WATCH },
    { t: 41.0, at: watch(1.5, 1.05, BLOWN_A), pose: REF_CROUCH },
    { t: 43.6, at: watch(1.6, -0.35, BD_DOWN_A), pose: REF_WATCH },
    { t: 46.0, at: watch(1.4, -1.95, TRADE_B), pose: REF_WATCH },
    { t: 49.0, at: watch(0.5, -2.1, GERMAN_DOWN_B), pose: REF_WATCH },
    // 決めのスリーカウント。カバーしている側の反対側に膝をつく。
    { t: 50.3, at: PIN_COUNT, pose: REF_PIN_UP },
    { t: 51.0, at: PIN_COUNT, pose: REF_PIN_SLAP, ease: 'in' },
    { t: 51.5, at: PIN_COUNT, pose: REF_PIN_UP },
    { t: 52.1, at: PIN_COUNT, pose: REF_PIN_SLAP, ease: 'in' },
    { t: 52.6, at: PIN_COUNT, pose: REF_PIN_UP },
    { t: 53.2, at: PIN_COUNT, pose: REF_PIN_SLAP, ease: 'in' },
    // 3つ入った。立ってゴングを要求し、勝者の腕を上げる。
    { t: 54.0, at: PIN_COUNT, pose: REF_WAVE },
    { t: 56.6, at: WIN_REF, pose: REF_RAISE },
    { t: 57.6, at: WIN_REF, pose: REF_RAISE },
    { t: 58.2, at: spot(-1.5, -1.6, 1.3), pose: WALK_A },
    { t: 59.2, at: spot(1.35, -1.95, 1.0), pose: WALK_B },
    { t: 60, at: watch(2.05, 1.75, CENTER_B), pose: REF_WATCH },
  ];
}

// ---------------------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------------------

export interface Match {
  group: THREE.Group;
  /** 経過秒を渡すとその時点の姿勢になる。DURATION 秒で一巡する。 */
  update(elapsed: number): void;
}

/** リング上の3人。 */
export function createMatch(): Match {
  const group = new THREE.Group();

  // 金髪・上半身裸・黒のロングタイツに赤のサイドライン・手首に白テープ。
  const a = createFighter({
    height: 1.83,
    hair: 0xe6d49b,
    torso: SKIN,
    legs: 0x15161b,
    accent: 0xd32f2f,
    wristTape: true,
  });
  // 黒髪・上半身裸・金と黒のロングタイツに赤の編み上げ・片腕に黒いエルボーパッド。
  const b = createFighter({
    height: 1.78,
    hair: 0x2a2320,
    torso: SKIN,
    legs: 0x9a7a2c,
    accent: 0xc62828,
    elbowPad: 0x1a1a1a,
  });
  // レフェリー: 黒のポロシャツ、黒のスラックス、黒ベルト、両手首に白テープ。
  const ref = createFighter({
    height: 1.74,
    hair: 0x14120f,
    torso: 0x1e1f23,
    legs: 0x131417,
    sleeves: 'short',
    belt: 0x0c0c0e,
    wristTape: true,
  });

  const cast: [Fighter, Key[]][] = [
    [a, trackA()],
    [b, trackB()],
    [ref, trackRef()],
  ];
  for (const [fighter] of cast) group.add(fighter.root);

  const update = (elapsed: number) => {
    const t = ((elapsed % DURATION) + DURATION) % DURATION;
    for (const [fighter, keys] of cast) applyTrack(fighter, keys, t);
  };
  update(0);

  return { group, update };
}

/**
 * リング下の黒いマットに控えるセコンドの若手。
 * 黒い長袖のジャージ上下に坊主頭で、リング中央を向いて片膝をついたまま動かない。
 * リングの東西に2人ずつ。トペが飛ぶ南側の正面は空けてある。
 */
export function createSeconds(): THREE.Group {
  const group = new THREE.Group();

  // 黒いマットの上、エプロン(3.22)とバリケードの間に並ぶ。
  const places: [number, number][] = [
    [-4.05, -1.5],
    [-4.05, 0.55],
    [4.05, -1.5],
    [4.05, 0.55],
  ];

  places.forEach(([x, z], index) => {
    const young = createFighter({
      height: 1.72 + ((index * 37) % 9) * 0.012,
      // 坊主なので髪の色は地肌に近い暗さだけ持たせる。
      hair: 0x2a2320,
      buzz: true,
      torso: 0x191a1e,
      legs: 0x141519,
      sleeves: 'long',
    });
    young.root.position.set(x, FLOOR, z);
    young.root.rotation.y = look({ x, z }, { x: 0, z: 0 });
    applyPose(young, SECOND_KNEEL);
    group.add(young.root);
  });

  return group;
}
