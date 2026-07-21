import * as THREE from 'three';

import { HALL, RING } from '../data/hall';
import { BLOCKS, SEATS, rowsOfBlock, type Seat, type SeatRow } from '../data/seats';

/**
 * 後楽園ホールを手続き的に組み立てたシーン。
 *
 * 客席の平面配置は公式座席表そのまま（data/seats.ts）で、見た目は公式サイトの
 * 「座席からの見え方」写真に寄せている: 木のひな壇（北・東・西・ステージ席）、
 * オレンジの固定席が並ぶ南側スタンド、リングサイドの赤いパイプ椅子、
 * 低めの天井と、リング上に吊られた照明トラス。
 */

const COLOR = {
  floor: 0x9c7846,
  wood: 0xc49a63,
  woodEdge: 0x3b332c,
  wall: 0xc6b99f,
  wallBand: 0x5a5044,
  ceiling: 0xcdc1a9,
  structure: 0x6b5f50,
  standSeat: 0xc25f26,
  chairSeat: 0x28305a,
  chairBack: 0xa32a1f,
  // リングはプロレスリング・ノア仕様。
  mat: 0x15693c,
  noahGreen: 0x149b57,
  rope: 0xc3c7cc,
  skirt: 0x121319,
  truss: 0x232529,
  lamp: 0xfff4d8,
} as const;

export function createHallScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x191713);

  scene.add(createShell());
  scene.add(createRing());
  scene.add(createPeople());
  scene.add(createStands());
  scene.add(createSeatFurniture());
  scene.add(...createLights());

  return scene;
}

const standard = (color: number, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness });

/** 床・壁・天井・照明トラス。 */
function createShell(): THREE.Group {
  const group = new THREE.Group();
  const width = HALL.maxX - HALL.minX;
  const depth = HALL.maxZ - HALL.minZ;
  const centerX = (HALL.minX + HALL.maxX) / 2;
  const centerZ = (HALL.minZ + HALL.maxZ) / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), standard(COLOR.floor, 0.85));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    standard(COLOR.ceiling, 1),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(centerX, HALL.ceilingY, centerZ);
  group.add(ceiling);

  const wall = standard(COLOR.wall, 1);
  const walls: [number, number, number, number][] = [
    // [幅, 中心x, 中心z, y回転]
    [width, centerX, HALL.minZ, 0],
    [width, centerX, HALL.maxZ, Math.PI],
    [depth, HALL.minX, centerZ, Math.PI / 2],
    [depth, HALL.maxX, centerZ, -Math.PI / 2],
  ];
  for (const [size, x, z, rotation] of walls) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, HALL.ceilingY), wall);
    plane.position.set(x, HALL.ceilingY / 2, z);
    plane.rotation.y = rotation;
    group.add(plane);

    // 壁の上の方にある2階ギャラリーの帯。高さの目安になる。
    const band = new THREE.Mesh(new THREE.PlaneGeometry(size, 1.5), standard(COLOR.wallBand, 1));
    band.position.set(x, HALL.galleryY, z);
    band.rotation.y = rotation;
    band.translateZ(0.05);
    group.add(band);
  }

  group.add(createCeilingRig());
  return group;
}

/** リングの真上に吊られた照明トラスと、客席側の天井照明。 */
function createCeilingRig(): THREE.Group {
  const group = new THREE.Group();
  const trussY = HALL.ceilingY - 2.0;
  const truss = standard(COLOR.truss, 0.7);
  const lamp = new THREE.MeshBasicMaterial({ color: COLOR.lamp });
  const lampGeometry = new THREE.SphereGeometry(0.14, 10, 8);

  // リング上に組まれた四角い枠と、その内側の桟。
  for (const x of [-5.6, -1.9, 1.9, 5.6]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 13), truss);
    beam.position.set(x, trussY, 0);
    group.add(beam);
  }
  for (const z of [-6.4, -3, 0, 3, 6.4]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.38, 0.38), truss);
    beam.position.set(0, trussY, z);
    group.add(beam);
  }
  // トラスにずらりと並ぶスポット。まぶしさがリング上の明暗を作る。
  for (let i = -6; i <= 6; i++) {
    for (const z of [-6.4, -3, 3, 6.4]) {
      const bulb = new THREE.Mesh(lampGeometry, lamp);
      bulb.position.set(i * 0.9, trussY - 0.32, z);
      group.add(bulb);
    }
  }
  // 客席側に向けた吊り照明の列（写真で客席の上に見える横一列のライト）。
  for (const z of [-8.5, 9.5]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 0.3), truss);
    bar.position.set(0, trussY + 0.6, z);
    group.add(bar);
    for (let i = -8; i <= 8; i++) {
      const bulb = new THREE.Mesh(lampGeometry, lamp);
      bulb.position.set(i * 0.9, trussY + 0.4, z);
      group.add(bulb);
    }
  }

  // 客席の上のダウンライト。
  const downlight = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), lamp);
  downlight.rotation.x = Math.PI / 2;
  for (let x = HALL.minX + 2; x < HALL.maxX; x += 3.5) {
    for (let z = HALL.minZ + 2; z < HALL.maxZ; z += 3.5) {
      if (Math.abs(x) < 6 && Math.abs(z) < 7) continue;
      const light = downlight.clone();
      light.position.set(x, HALL.ceilingY - 0.02, z);
      group.add(light);
    }
  }

  return group;
}

/** マット・エプロン・ロープ・コーナーポスト・リング階段。 */
function createRing(): THREE.Group {
  const group = new THREE.Group();
  const { matHalf, apronHalf, matY, postHeight, ropeHeights } = RING;

  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(apronHalf * 2, matY, apronHalf * 2),
    standard(COLOR.skirt, 0.95),
  );
  skirt.position.y = matY / 2;
  group.add(skirt);

  // スカート上端のグリーンのライン。
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(apronHalf * 2 + 0.02, 0.1, apronHalf * 2 + 0.02),
    standard(COLOR.noahGreen, 0.8),
  );
  trim.position.y = matY - 0.12;
  group.add(trim);

  // キャンバスはエプロンまで一続き。ノアのリングなのでグリーン。
  const canvas = new THREE.Mesh(
    new THREE.BoxGeometry(apronHalf * 2, 0.1, apronHalf * 2),
    standard(COLOR.mat, 0.8),
  );
  canvas.position.y = matY + 0.05;
  group.add(canvas);

  const corners: [number, number][] = [
    [matHalf, matHalf],
    [-matHalf, -matHalf],
    [matHalf, -matHalf],
    [-matHalf, matHalf],
  ];

  for (const [x, z] of corners) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, postHeight, 12),
      standard(0xd8d8d8, 0.5),
    );
    post.position.set(x, matY + postHeight / 2, z);
    group.add(post);

    // コーナーパッドはノアのグリーン。上下に白帯（スポンサーロゴが入る面）。
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 1.25, 12),
      standard(COLOR.noahGreen, 0.7),
    );
    pad.position.set(x, matY + 1.05, z);
    group.add(pad);

    for (const offset of [-0.42, 0.42]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.175, 0.175, 0.2, 12),
        standard(0xf0f0ee, 0.7),
      );
      band.position.set(x, matY + 1.05 + offset, z);
      group.add(band);
    }
  }

  // ロープはシルバー（レフェリーの写真に写っているノアのリングに合わせた）。
  ropeHeights.forEach((height) => {
    const material = new THREE.MeshStandardMaterial({
      color: COLOR.rope,
      roughness: 0.35,
      metalness: 0.5,
    });
    for (const sign of [1, -1]) {
      const alongX = new THREE.Mesh(new THREE.BoxGeometry(matHalf * 2, 0.06, 0.06), material);
      alongX.position.set(0, matY + height, sign * matHalf);
      group.add(alongX);

      const alongZ = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, matHalf * 2), material);
      alongZ.position.set(sign * matHalf, matY + height, 0);
      group.add(alongZ);
    }
  });

  // リング階段（西南と東北の角）。
  for (const [x, z] of [
    [-apronHalf - 0.5, apronHalf - 1.2],
    [apronHalf + 0.5, -apronHalf + 1.2],
  ]) {
    const steps = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.12, 0.35),
        standard(COLOR.structure, 0.8),
      );
      step.position.set(x, 0.35 + i * 0.3, z + (x > 0 ? -1 : 1) * i * 0.35);
      steps.add(step);
    }
    group.add(steps);
  }

  return group;
}

interface PersonSpec {
  /** リング上の位置と向き（向きはラジアン、0で+Z＝南を向く）。 */
  x: number;
  z: number;
  facing: number;
  height: number;
  hair: number;
  /** 上半身。裸なら肌色、レフェリーはシャツの色。 */
  torso: number;
  /** 短パン・ロングタイツ・スラックスの色。 */
  legs: number;
  /** タイツのサイドに入る差し色。 */
  accent?: number;
  /** 半袖なら二の腕だけシャツ色になる。 */
  sleeves?: boolean;
  /** 手首のテーピング（白）。 */
  wristTape?: boolean;
  belt?: number;
  /** 片腕のエルボーパッド。 */
  elbowPad?: number;
}

const SKIN = 0xbd8657;

/**
 * リング上の3人。
 * 2人のレスラーとレフェリーは、それぞれの写真の髪色・コスチュームの配色に寄せている
 * （顔立ちまでは作り込まない、色と装備でそれと分かる程度）。
 */
function createPeople(): THREE.Group {
  const group = new THREE.Group();

  const people: PersonSpec[] = [
    {
      // 金髪・上半身裸・黒のロングタイツに赤のサイドライン・手首に白テープ。
      x: -0.85,
      z: 0.55,
      facing: Math.atan2(1.7, -0.9),
      height: 1.83,
      hair: 0xe6d49b,
      torso: SKIN,
      legs: 0x15161b,
      accent: 0xd32f2f,
      wristTape: true,
    },
    {
      // 黒髪・上半身裸・金と黒のロングタイツに赤の編み上げ・片腕に黒いエルボーパッド。
      x: 0.85,
      z: -0.35,
      facing: Math.atan2(-1.7, 0.9),
      height: 1.78,
      hair: 0x2a2320,
      torso: SKIN,
      legs: 0x9a7a2c,
      accent: 0xc62828,
      elbowPad: 0x1a1a1a,
    },
    {
      // レフェリー: 黒のポロシャツ（ノアのロゴ入り）、黒のスラックス、黒ベルト、両手首に白テープ。
      x: 1.95,
      z: 1.6,
      facing: Math.atan2(-1.95, -1.6),
      height: 1.74,
      hair: 0x14120f,
      torso: 0x1e1f23,
      legs: 0x131417,
      sleeves: true,
      belt: 0x0c0c0e,
      wristTape: true,
    },
  ];

  for (const spec of people) group.add(createPerson(spec));
  return group;
}

/** 人ひとり。足元を原点、ローカル +Z を正面として組み立てる。 */
function createPerson(spec: PersonSpec): THREE.Group {
  const person = new THREE.Group();
  const h = spec.height;
  const skin = standard(SKIN, 0.75);
  const legMaterial = standard(spec.legs, 0.7);

  const add = (mesh: THREE.Mesh, x: number, y: number, z = 0) => {
    mesh.position.set(x, y, z);
    person.add(mesh);
    return mesh;
  };

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.083, 0.44 * h, 4, 8),
      legMaterial,
    );
    add(leg, side * 0.1, 0.25 * h);

    // タイツのサイドに入る差し色。
    if (spec.accent !== undefined) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.28 * h, 0.1),
        standard(spec.accent, 0.7),
      );
      add(stripe, side * 0.155, 0.3 * h);
    }

    const boot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.06 * h, 8),
      standard(0x121215, 0.6),
    );
    add(boot, side * 0.1, 0.03 * h);
  }

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11 * h, 0.19), legMaterial);
  add(hips, 0, 0.5 * h);

  if (spec.belt !== undefined) {
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.04, 0.21),
      standard(spec.belt, 0.5),
    );
    add(belt, 0, 0.54 * h);
  }

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.155, 0.2 * h, 4, 10),
    standard(spec.torso, 0.75),
  );
  torso.scale.set(1.15, 1, 0.78);
  add(torso, 0, 0.66 * h);

  for (const side of [-1, 1]) {
    if (spec.sleeves) {
      // 半袖シャツ: 二の腕まではシャツ、そこから先は素肌。
      const sleeve = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, 0.1 * h, 4, 8),
        standard(spec.torso, 0.75),
      );
      add(sleeve, side * 0.24, 0.71 * h);
      const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16 * h, 4, 8), skin);
      add(forearm, side * 0.25, 0.55 * h);
    } else {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.3 * h, 4, 8), skin);
      add(arm, side * 0.245, 0.65 * h);
    }

    if (spec.wristTape) {
      const tape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.062, 0.062, 0.07, 8),
        standard(0xf2f0ea, 0.8),
      );
      add(tape, side * 0.25, 0.47 * h);
    }
  }

  if (spec.elbowPad !== undefined) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.11, 8),
      standard(spec.elbowPad, 0.7),
    );
    add(pad, 0.245, 0.6 * h);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.05 * h, 8), skin);
  add(neck, 0, 0.79 * h);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), skin);
  head.scale.set(0.92, 1.05, 0.95);
  add(head, 0, 0.87 * h);

  // 髪は頭のてっぺんから後頭部を覆うキャップ。前は開けて顔にする。
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.112, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    standard(spec.hair, 0.85),
  );
  hair.scale.set(0.95, 1.1, 1.0);
  add(hair, 0, 0.872 * h, -0.012);

  person.position.set(spec.x, RING.matY + 0.1, spec.z);
  person.rotation.y = spec.facing;
  return person;
}

/**
 * ひな壇・スタンドの構造物。
 * 南側は固定席が載るコンクリートのスタンド、それ以外は木のベンチひな壇。
 */
function createStands(): THREE.Group {
  const group = new THREE.Group();

  for (const block of BLOCKS) {
    if (block.kind !== 'stand') continue;
    const rows = rowsOfBlock(block);
    const pitch = rowPitch(rows);
    const wooden = block.code !== 'S';

    for (const row of rows) {
      const extent = lateralExtent(row);
      const horizontal = block.side === 'N' || block.side === 'S';
      const outward = block.side === 'S' || block.side === 'E' ? 1 : -1;
      const width = extent.max - extent.min + 0.5;
      const center = (extent.min + extent.max) / 2;
      const depthCenter = row.depth * outward;

      // 床から段の高さまでの塊。手前の段と重なるが、内側からは見えない。
      // リング側を向く垂直面（蹴上げ）だけ暗くして、段々に見えるようにする。
      const top = standard(wooden ? COLOR.wood : COLOR.structure, 0.95);
      const riser = standard(wooden ? COLOR.woodEdge : 0x4c4338, 0.95);
      const faces = [top, top, top, top, top, top];
      faces[frontFaceIndex(block.side)] = riser;

      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontal ? width : pitch,
          Math.max(row.y, 0.12),
          horizontal ? pitch : width,
        ),
        faces,
      );
      tier.position.set(
        horizontal ? center : depthCenter,
        Math.max(row.y, 0.12) / 2,
        horizontal ? depthCenter : center,
      );
      group.add(tier);

      // 段鼻の見切り。木のひな壇は写真でも黒い縁が目立つ。
      const nosing = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? width : 0.08, 0.11, horizontal ? 0.08 : width),
        standard(COLOR.woodEdge, 0.8),
      );
      const frontEdge = depthCenter - (outward * pitch) / 2;
      nosing.position.set(
        horizontal ? center : frontEdge,
        row.y + 0.03,
        horizontal ? frontEdge : center,
      );
      group.add(nosing);

      if (wooden) {
        // 木のベンチ（背もたれなし）。ここに座る。
        const bench = new THREE.Mesh(
          new THREE.BoxGeometry(
            horizontal ? width - 0.3 : 0.42,
            0.09,
            horizontal ? 0.42 : width - 0.3,
          ),
          standard(COLOR.wood, 0.7),
        );
        bench.position.set(
          horizontal ? center : depthCenter + outward * 0.1,
          row.y + 0.42,
          horizontal ? depthCenter + outward * 0.1 : center,
        );
        group.add(bench);
      }
    }
  }

  return group;
}

/** BoxGeometry の面の並び [+x, -x, +y, -y, +z, -z] のうち、リング側を向く面。 */
function frontFaceIndex(side: 'N' | 'S' | 'E' | 'W'): number {
  return { W: 0, E: 1, N: 4, S: 5 }[side];
}

/** その列が横（または縦）方向にどこからどこまで伸びているか。 */
function lateralExtent(row: SeatRow): { min: number; max: number } {
  const horizontal = row.block.side === 'N' || row.block.side === 'S';
  const values = row.seats.map((seat) => (horizontal ? seat.x : seat.z));
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** 列と列の間隔。通路を挟む部分があるので中央値を使う。 */
function rowPitch(rows: SeatRow[]): number {
  const gaps = rows.slice(1).map((row, index) => row.depth - rows[index].depth);
  if (gaps.length === 0) return 0.7;
  const sorted = gaps.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * 座席そのもの。リングサイドのパイプ椅子と南側スタンドの固定席を
 * それぞれ InstancedMesh で描く（木のひな壇はベンチなので座席の形はない）。
 */
function createSeatFurniture(): THREE.Group {
  const group = new THREE.Group();
  const folding = SEATS.filter((seat) => seat.block.kind === 'flat');
  const fixed = SEATS.filter((seat) => seat.block.code === 'S');

  group.add(
    instancedSeats(folding, {
      seatColor: COLOR.chairSeat,
      backColor: COLOR.chairBack,
      seatY: 0.44,
      backY: 0.68,
      width: 0.42,
      backHeight: 0.4,
    }),
  );
  group.add(
    instancedSeats(fixed, {
      seatColor: COLOR.standSeat,
      backColor: COLOR.standSeat,
      seatY: 0.42,
      backY: 0.7,
      width: 0.46,
      backHeight: 0.46,
    }),
  );
  return group;
}

interface SeatStyle {
  seatColor: number;
  backColor: number;
  seatY: number;
  backY: number;
  width: number;
  backHeight: number;
}

function instancedSeats(seats: Seat[], style: SeatStyle): THREE.Group {
  const group = new THREE.Group();
  const count = seats.length;
  if (count === 0) return group;

  const pad = new THREE.InstancedMesh(
    new THREE.BoxGeometry(style.width, 0.06, 0.42),
    standard(style.seatColor, 0.85),
    count,
  );
  const back = new THREE.InstancedMesh(
    new THREE.BoxGeometry(style.width, style.backHeight, 0.06),
    standard(style.backColor, 0.85),
    count,
  );

  const dummy = new THREE.Object3D();
  seats.forEach((seat, index) => {
    // 椅子のローカル +Z がリングの反対（＝背もたれ側）を向くように回す。
    const yaw = Math.atan2(seat.x, seat.z);

    dummy.rotation.set(0, yaw, 0);
    dummy.position.set(seat.x, seat.y + style.seatY, seat.z);
    dummy.updateMatrix();
    pad.setMatrixAt(index, dummy.matrix);

    dummy.position.set(
      seat.x + Math.sin(yaw) * 0.2,
      seat.y + style.backY,
      seat.z + Math.cos(yaw) * 0.2,
    );
    dummy.updateMatrix();
    back.setMatrixAt(index, dummy.matrix);
  });

  pad.instanceMatrix.needsUpdate = true;
  back.instanceMatrix.needsUpdate = true;
  group.add(pad, back);
  return group;
}

function createLights(): THREE.Object3D[] {
  // 写真の後楽園ホールは全体が暖色で明るいが、リングだけは一段明るい。
  // 環境光を上げすぎると陰影が消えて場内が平坦になるので控えめにする。
  const ambient = new THREE.AmbientLight(0xffeed4, 0.55);
  const sky = new THREE.HemisphereLight(0xffeedb, 0x4a3c2c, 0.5);

  // リングを照らすトラスのスポット。
  // 強すぎるとマットの緑が白飛びするので控えめに。
  const key = new THREE.SpotLight(0xfff6e6, 220, 30, Math.PI / 4, 0.6, 1.2);
  key.position.set(0, HALL.ceilingY - 2.4, 0);
  key.target.position.set(0, RING.matY, 0);

  const house: THREE.Object3D[] = [];
  for (const [x, z] of [
    [0, -12],
    [0, 8],
    [0, 18],
    [-10, 0],
    [10, 0],
  ]) {
    const lamp = new THREE.PointLight(0xffe4bd, 300, 30, 1.5);
    lamp.position.set(x, HALL.ceilingY - 1.0, z);
    house.push(lamp);
  }

  return [ambient, sky, key, key.target, ...house];
}
