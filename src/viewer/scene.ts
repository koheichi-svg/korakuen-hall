import * as THREE from 'three';

import { BALCONY, HALL, RING } from '../data/hall';
import { BLOCKS, SEATS, rowsOfBlock, type Seat, type SeatRow, type Side } from '../data/seats';

/**
 * 後楽園ホールを手続き的に組み立てたシーン。
 *
 * 客席の平面配置は公式座席表そのまま（data/seats.ts）で、見た目は公式サイトの
 * 「座席からの見え方」写真に寄せている: 木のひな壇（北・東・西・ステージ席）、
 * オレンジの固定席が並ぶ南側スタンド、リングサイドの赤いパイプ椅子、
 * 低めの天井と、リング上に吊られた照明トラス。
 */

const COLOR = {
  floor: 0xb07b3f,
  // ひな壇は白木のベンチ（写真では番号が白くステンシルされている）。
  wood: 0xd6ad7c,
  woodEdge: 0x4a3b2c,
  wall: 0xd6ccb8,
  wallBand: 0x5a4a3a,
  ceiling: 0xe2dac9,
  structure: 0x8a8278,
  // 南側スタンドの固定席: オレンジのビニール張り、肘掛けと背面シェルは焦げ茶。
  standSeat: 0xd2541f,
  standShell: 0x2d2521,
  armrest: 0x3a2f28,
  numberPlate: 0xf2efe6,
  // リングサイドのパイプ椅子: 座面は穴あきの濃いグレー、背もたれは赤い広告カバー。
  chairSeat: 0x3d3c40,
  chairBack: 0xc4162a,
  chrome: 0xb9bec4,
  grip: 0x1b1b1e,
  rail: 0xd5d0c2,
  balconyWall: 0xe6e0d2,
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
  scene.background = new THREE.Color(0x0e0d0b);

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

/** パイプ椅子のフレームや手すりのような金属。 */
const metal = (color: number, roughness = 0.35) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.7 });

/** 寄木タイル1枚の実寸(m)。4×4ブロック分。 */
const PARQUET_TILE = 1.24;

/** 体育館の寄木床。ブロックごとに板の向きが90度変わる市松。 */
function createParquetTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const block = size / 4;
  const plank = block / 4;

  for (let by = 0; by < 4; by++) {
    for (let bx = 0; bx < 4; bx++) {
      const vertical = (bx + by) % 2 === 0;
      for (let i = 0; i < 4; i++) {
        // 板ごとに明るさを散らして木目のむらを出す。
        const lightness = 42 + ((bx * 5 + by * 11 + i * 7) % 6) * 2.4;
        ctx.fillStyle = `hsl(31, 46%, ${lightness}%)`;
        const x = bx * block + (vertical ? i * plank : 0);
        const y = by * block + (vertical ? 0 : i * plank);
        ctx.fillRect(x, y, vertical ? plank : block, vertical ? block : plank);
        ctx.strokeStyle = 'rgba(60, 38, 16, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, (vertical ? plank : block) - 1, (vertical ? block : plank) - 1);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** 壁の「西 WEST」のような方角看板。漢字は黒、下の英字は赤。 */
function createSignTexture(kanji: string, roman: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 110;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(0, 0, 128, 110);
  ctx.strokeStyle = '#8a8378';
  ctx.strokeRect(1, 1, 126, 108);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#17181a';
  ctx.font = 'bold 62px sans-serif';
  ctx.fillText(kanji, 64, 68);
  ctx.fillStyle = '#c0182a';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(roman, 64, 96);
  return new THREE.CanvasTexture(canvas);
}

/** 床・壁・天井・照明トラス。 */
function createShell(): THREE.Group {
  const group = new THREE.Group();
  const width = HALL.maxX - HALL.minX;
  const depth = HALL.maxZ - HALL.minZ;
  const centerX = (HALL.minX + HALL.maxX) / 2;
  const centerZ = (HALL.minZ + HALL.maxZ) / 2;

  // 床は体育館の寄木（ブロックごとに板の向きが直交する）。
  const parquet = createParquetTexture();
  parquet.repeat.set(width / PARQUET_TILE, depth / PARQUET_TILE);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.55 }),
  );
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
  // 看板は「客席のすぐ後ろの壁」に付ける。東西は1階の内壁（INNER_WALL）、
  // 南北はホールの外壁。南北はひな壇がせり上がってくるぶん高い位置に逃がす。
  const signFace = INNER_WALL.x - INNER_WALL.thickness / 2 - 0.06;
  const walls: [Side, string, string, number, number, number, number, [number, number, number]][] =
    [
      ['N', '北', 'NORTH', width, centerX, HALL.minZ, 0, [0, 5.1, HALL.minZ + 0.06]],
      ['S', '南', 'SOUTH', width, centerX, HALL.maxZ, Math.PI, [0, 8.3, HALL.maxZ - 0.06]],
      ['W', '西', 'WEST', depth, HALL.minX, centerZ, Math.PI / 2, [-signFace, 3.3, -1.5]],
      ['E', '東', 'EAST', depth, HALL.maxX, centerZ, -Math.PI / 2, [signFace, 3.3, -1.5]],
    ];
  for (const [side, kanji, roman, size, x, z, rotation, signPosition] of walls) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, HALL.ceilingY), wall);
    plane.position.set(x, HALL.ceilingY / 2, z);
    plane.rotation.y = rotation;
    group.add(plane);

    // 2階の高さの帯。東西はここが実際のバルコニー席の開口になるので、
    // 帯と手すりは南北の壁だけに描く。
    if (side === 'N' || side === 'S') {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(size, 1.5), standard(COLOR.wallBand, 1));
      band.position.set(x, HALL.galleryY, z);
      band.rotation.y = rotation;
      band.translateZ(0.05);
      group.add(band);

      const rail = new THREE.Group();
      const railTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, size, 8),
        metal(COLOR.rail),
      );
      railTube.rotation.z = Math.PI / 2;
      railTube.position.y = 0.55;
      rail.add(railTube);
      for (let offset = -size / 2 + 0.6; offset < size / 2; offset += 2.4) {
        const post = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6),
          metal(COLOR.rail),
        );
        post.position.set(offset, 0.28, 0);
        rail.add(post);
      }
      rail.position.set(x, HALL.galleryY - 0.75, z);
      rail.rotation.y = rotation;
      rail.translateZ(0.25);
      group.add(rail);
    }

    // 客席の方角を示す白い看板（漢字が黒、下の英字が赤）。四方すべてに向かい合わせで付く。
    const material = new THREE.MeshBasicMaterial({
      map: createSignTexture(kanji, roman),
      transparent: true,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), material);
    sign.position.fromArray(signPosition);
    sign.rotation.y = rotation;
    group.add(sign);
  }

  group.add(createInnerWalls());
  group.add(createBalconies());
  group.add(createScreen());
  group.add(createCeilingRig());
  return group;
}

/**
 * 1階の内壁。実物は客席の後ろにほとんど余白がなく、すぐ壁が立っている。
 * ホールの外形(HALL)は2階バルコニーの奥行きまで含んだ大きさなので、
 * 1階の壁は別にこの位置で立てる。
 */
const INNER_WALL = {
  /** 東西スタンドの後ろの壁（この上がバルコニーの手すり壁）。 */
  x: 12.15,
  /** 南側スタンドの両脇の壁。南側は客席の幅が狭いぶん内側に入る。 */
  southX: 11.4,
  /** 南側スタンドの脇に切り替わるz。 */
  southZ: 7.6,
  thickness: 0.3,
} as const;

/**
 * 東西スタンドの後ろと、南側スタンドの両脇に立つ壁。
 * 東西はバルコニーの開口ぶんだけ背が低く（そこから上が2階の客席）、
 * それ以外は天井まで立ち上がる。
 */
function createInnerWalls(): THREE.Group {
  const group = new THREE.Group();
  const material = standard(COLOR.wall, 1);
  const { x: innerX, southX, southZ, thickness } = INNER_WALL;

  /** z方向に伸びる壁を1枚。 */
  const wallAlongZ = (x: number, fromZ: number, toZ: number, top: number) => {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, top, toZ - fromZ),
      material,
    );
    panel.position.set(x, top / 2, (fromZ + toZ) / 2);
    group.add(panel);
  };

  for (const sign of [1, -1]) {
    // 北側〜バルコニー手前、バルコニーの下（開口の高さまで）、バルコニーの南側。
    wallAlongZ(sign * innerX, HALL.minZ, BALCONY.minZ, HALL.ceilingY);
    wallAlongZ(sign * innerX, BALCONY.minZ, BALCONY.maxZ, BALCONY.floorY);
    wallAlongZ(sign * innerX, BALCONY.maxZ, southZ, HALL.ceilingY);
    // 南側スタンドの脇。手前で内側に振ってから、南の壁まで通す。
    wallAlongZ(sign * southX, southZ, HALL.maxZ, HALL.ceilingY);
    const jog = new THREE.Mesh(
      new THREE.BoxGeometry(innerX - southX + thickness, HALL.ceilingY, thickness),
      material,
    );
    jog.position.set((sign * (innerX + southX)) / 2, HALL.ceilingY / 2, southZ);
    group.add(jog);
  }

  return group;
}

/**
 * 東西の壁の上部にある2階バルコニー席。
 *
 * 写真だと、白い低い手すり壁の内側に椅子が並び、開口は柱で3つほどのベイに分かれていて、
 * 上は下がり天井、下（1階から見上げると）はスラブの裏と、そこに吊られた広告幕。
 * 床は前列・後列の2段（後列の床が一段上がる）で、座席そのものは createSeatFurniture が置く。
 */
function createBalconies(): THREE.Group {
  const group = new THREE.Group();
  const { floorY, innerX, outerX, minZ, maxZ, parapetHeight, soffitY } = BALCONY;
  const span = maxZ - minZ;
  const centerZ = (minZ + maxZ) / 2;
  const slab = standard(COLOR.structure, 0.95);
  const parapet = standard(COLOR.balconyWall, 0.95);

  for (const sign of [1, -1]) {
    const side = new THREE.Group();
    const depth = outerX - innerX;

    // 床。前列の高さと、一段上がった後列の高さの2枚。
    for (const [from, to, top] of [
      [innerX, innerX + 0.9, floorY],
      [innerX + 0.9, outerX, floorY + 0.45],
    ]) {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(to - from, 0.35, span), slab);
      deck.position.set(sign * (from + to) / 2, top - 0.175, centerZ);
      side.add(deck);
    }

    // 手すり壁と、その上端の見切り。
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.16, parapetHeight, span), parapet);
    wall.position.set(sign * innerX, floorY + parapetHeight / 2, centerZ);
    side.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, span), standard(0x6f665a, 0.8));
    cap.position.set(sign * innerX, floorY + parapetHeight, centerZ);
    side.add(cap);

    // 開口を仕切る柱（写真だと3つのベイに分かれている）と、上の下がり天井。
    // リング正面にあたる中央には柱を立てない——実物もここは開いている。
    for (const z of [minZ, -span / 4, span / 4, maxZ]) {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, soffitY - floorY, 0.28),
        standard(COLOR.wall, 0.95),
      );
      column.position.set(sign * innerX, (floorY + soffitY) / 2, z);
      side.add(column);
    }
    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(depth, HALL.ceilingY - soffitY, span),
      standard(COLOR.wall, 1),
    );
    fascia.position.set(sign * (innerX + depth / 2), (soffitY + HALL.ceilingY) / 2, centerZ);
    side.add(fascia);

    // バルコニーの下に吊られた広告幕。1階から見上げるとこれが目に入る。
    const banners = [0xa8172a, 0x1b1c22, 0x123a6b, 0xa8172a];
    banners.forEach((color, index) => {
      const width = span / banners.length - 0.5;
      const banner = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.1, width),
        standard(color, 0.9),
      );
      banner.position.set(
        sign * (innerX - 0.02),
        floorY - 0.9,
        minZ + (span / banners.length) * (index + 0.5),
      );
      side.add(banner);
    });

    group.add(side);
  }

  return group;
}

/**
 * 北側スタンドの上に吊られた大型スクリーン。
 * 北側の客席は最後列で床が3.9mまで上がるので、その頭上を越える高さに掛かっている。
 * 画面は南（客席側）を向くので、北側スタンドからは裏の黒い箱しか見えない。
 */
function createScreen(): THREE.Group {
  const group = new THREE.Group();
  const width = 6.0;
  const height = 3.4;
  const z = -15.0;
  const y = 7.2;
  const bezel = standard(0x141416, 0.7);

  const box = new THREE.Mesh(new THREE.BoxGeometry(width + 0.34, height + 0.34, 0.4), bezel);
  box.position.set(0, y, z);
  group.add(box);

  // 発光面。周りの照明に影響されないよう Basic で描く。
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: createScreenTexture() }),
  );
  face.position.set(0, y, z + 0.21);
  group.add(face);

  // 天井から吊るワイヤーと、下向きの補強。
  for (const x of [-width / 2 + 0.4, width / 2 - 0.4]) {
    const top = y + height / 2 + 0.17;
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, HALL.ceilingY - top, 6),
      standard(0x17171a, 0.6),
    );
    wire.position.set(x, (HALL.ceilingY + top) / 2, z);
    group.add(wire);
  }

  return group;
}

/** スクリーンの表示面。中央が明るく落ちていく、試合前のスタンバイ画面のような絵。 */
function createScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 290;
  const ctx = canvas.getContext('2d')!;

  const glow = ctx.createRadialGradient(256, 130, 20, 256, 145, 300);
  glow.addColorStop(0, '#2f3f5c');
  glow.addColorStop(1, '#080a10');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 290);

  ctx.fillStyle = '#f0f2f6';
  ctx.textAlign = 'center';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('後楽園ホール', 256, 150);
  ctx.fillStyle = '#8fa6c8';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('KORAKUEN HALL', 256, 190);

  // 走査線。ドット感が出て「映っている」ように見える。
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (let y = 0; y < 290; y += 3) ctx.fillRect(0, y, 512, 1);

  return new THREE.CanvasTexture(canvas);
}

/** リングの真上に吊られた照明トラスと、客席側の天井照明。 */
function createCeilingRig(): THREE.Group {
  const group = new THREE.Group();
  const trussY = HALL.ceilingY - 2.0;
  const truss = standard(COLOR.truss, 0.7);
  const lamp = new THREE.MeshBasicMaterial({ color: COLOR.lamp });

  // バトンに吊られた黒いパーライト。数が多いので位置だけ溜めて最後にまとめて描く。
  const ringTarget = new THREE.Vector3(0, RING.matY, 0);
  const cans: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const parCan = (x: number, y: number, z: number) => {
    dummy.position.set(x, y, z);
    dummy.lookAt(ringTarget); // ローカル +Z が照射方向
    dummy.updateMatrix();
    cans.push(dummy.matrix.clone());
  };

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
  // トラスにずらりと並ぶ黒いパーライト。まぶしさがリング上の明暗を作る。
  for (let i = -6; i <= 6; i++) {
    for (const z of [-6.4, -3, 3, 6.4]) {
      parCan(i * 0.9, trussY - 0.42, z);
    }
  }
  // 客席の上に渡したバトンにも、リングを狙った灯体がびっしり並ぶ。
  for (const z of [-9.5, -12.5, 10.5, 14]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(20, 0.22, 0.22), truss);
    bar.position.set(0, trussY + 0.9, z);
    group.add(bar);
    for (let i = -8; i <= 8; i++) {
      parCan(i * 1.2, trussY + 0.62, z);
    }
  }
  for (const x of [-11, 11]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 26), truss);
    bar.position.set(x, trussY + 0.9, 2);
    group.add(bar);
    for (let i = -5; i <= 5; i++) {
      parCan(x, trussY + 0.62, 2 + i * 2.2);
    }
  }

  // 溜めた灯体を部品ごとに InstancedMesh でまとめて出す。
  // 灯体のローカル: +Z が照射方向、+Y が吊り元。
  const canBody = standard(COLOR.truss, 0.6);
  const canHardware = standard(0x17171a, 0.6);
  const canParts: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] =
    [
      {
        geometry: new THREE.CylinderGeometry(0.115, 0.13, 0.3, 12),
        material: canBody,
        local: new THREE.Matrix4().makeRotationX(Math.PI / 2),
      },
      {
        geometry: new THREE.CircleGeometry(0.115, 12),
        material: lamp,
        local: new THREE.Matrix4().makeTranslation(0, 0, 0.151),
      },
      {
        geometry: new THREE.BoxGeometry(0.32, 0.03, 0.03),
        material: canHardware,
        local: new THREE.Matrix4().makeTranslation(0, 0.14, 0),
      },
      {
        geometry: new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6),
        material: canHardware,
        local: new THREE.Matrix4().makeTranslation(0, 0.26, 0),
      },
    ];
  const world = new THREE.Matrix4();
  for (const part of canParts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, cans.length);
    cans.forEach((matrix, index) =>
      mesh.setMatrixAt(index, world.multiplyMatrices(matrix, part.local)),
    );
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
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
    // ひな壇の木の段は、木のベンチが載るブロックだけ。
    // ステージ席は同じ木の段だが、載っているのは折りたたみ椅子。
    const wooden = block.furniture !== 'fixed';

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

      if (block.furniture === 'bench') {
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

    group.add(createFrontRail(block.side, rows[0], pitch));
  }

  return group;
}

/**
 * スタンド最前列の手前に立つ手すり。
 * 写真だと南側スタンドの前は銀色のパイプ、木のひな壇はクリーム色の塗装パイプ。
 */
function createFrontRail(side: Side, front: SeatRow, pitch: number): THREE.Group {
  const rail = new THREE.Group();
  const horizontal = side === 'N' || side === 'S';
  const outward = side === 'S' || side === 'E' ? 1 : -1;
  const extent = lateralExtent(front);
  const width = extent.max - extent.min + 0.5;
  const material = metal(COLOR.rail);
  const edge = front.depth * outward - (outward * pitch) / 2 - 0.2;

  const place = (mesh: THREE.Mesh, along: number, y: number) => {
    mesh.position.set(horizontal ? along : edge, front.y + y, horizontal ? edge : along);
    rail.add(mesh);
  };

  // 最前列に座った人の視線（床から約1.15m）より低く抑える。
  const height = 0.75;
  for (const y of [height * 0.55, height]) {
    const tubeMesh = new THREE.Mesh(tube(0.04, width), material);
    tubeMesh.rotation.z = Math.PI / 2;
    if (!horizontal) tubeMesh.rotation.y = Math.PI / 2;
    place(tubeMesh, (extent.min + extent.max) / 2, y);
  }
  for (let along = extent.min; along <= extent.max; along += 2.6) {
    place(new THREE.Mesh(tube(0.03, height), material), along, height / 2);
  }

  return rail;
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
 * 椅子の向き。実際の後楽園ホールは、どのブロックも椅子が列に沿ってまっすぐ並んでいて、
 * 一脚ずつリング中心を向いたりはしない。ブロックの外側（＝背もたれ側）が
 * 椅子のローカル +Z になるように、側ごとの yaw を固定で与える。
 */
const OUTWARD_YAW: Record<Side, number> = {
  S: 0,
  N: Math.PI,
  E: Math.PI / 2,
  W: -Math.PI / 2,
};

/**
 * 座席そのもの。リングサイドのパイプ椅子と南側スタンドの固定席を
 * それぞれ InstancedMesh で描く（木のひな壇はベンチなので座席の形はない）。
 */
function createSeatFurniture(): THREE.Group {
  const group = new THREE.Group();
  const folding = SEATS.filter((seat) => seat.block.furniture === 'folding');
  const fixed = SEATS.filter((seat) => seat.block.furniture === 'fixed');

  group.add(instancedParts(folding, foldingChairParts()));
  group.add(instancedParts(fixed, fixedSeatParts()));
  return group;
}

/** 椅子を構成する部品ひとつ。位置・回転は「足元の中心が原点、+Zが背中側」のローカル座標。 */
interface ChairPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  position: [number, number, number];
  /** X軸まわりの傾き。正で上端が背中側(+Z)に倒れる。 */
  tiltX?: number;
}

/**
 * リングサイドの折りたたみパイプ椅子。
 * 穴あきの濃いグレーの座面、赤い広告カバーの背もたれ、銀のパイプフレーム
 * （前脚と後脚がX字に交差し、床には前後方向のランナーが付く）。
 */
function foldingChairParts(): ChairPart[] {
  const seat = standard(COLOR.chairSeat, 0.75);
  const back = standard(COLOR.chairBack, 0.8);
  const frame = metal(COLOR.chrome);
  const grip = standard(COLOR.grip, 0.6);
  const parts: ChairPart[] = [];

  // 背フレームは床の後ろから背もたれの上まで一本で立ち上がる（少し後ろに倒れる）。
  const uprightTilt = 0.1;
  // 前脚は床の前から座面の後ろへ、後脚と交差しながら上がる。
  const legTilt = 0.51;

  for (const side of [-1, 1]) {
    const x = side * 0.21;
    parts.push(
      { geometry: tube(0.018, 0.9), material: frame, position: [x, 0.45, 0.205], tiltX: uprightTilt },
      { geometry: tube(0.018, 0.52), material: frame, position: [x, 0.23, -0.07], tiltX: legTilt },
      // 床に接する前後のランナー。
      {
        geometry: tube(0.018, 0.46),
        material: frame,
        position: [x, 0.018, 0.02],
        tiltX: Math.PI / 2,
      },
      // フレームを握るための黒いグリップ。
      { geometry: tube(0.03, 0.16), material: grip, position: [x, 0.63, 0.223], tiltX: uprightTilt },
    );
  }

  parts.push(
    // 座面（樹脂）。
    { geometry: new THREE.BoxGeometry(0.44, 0.045, 0.42), material: seat, position: [0, 0.44, 0.02] },
    // 背もたれ（赤いカバー）。
    {
      geometry: new THREE.BoxGeometry(0.42, 0.26, 0.035),
      material: back,
      position: [0, 0.79, 0.222],
      tiltX: uprightTilt,
    },
    // 前脚どうしをつなぐ貫（横向きなので丸パイプではなく角材で代用）。
    {
      geometry: new THREE.BoxGeometry(0.42, 0.028, 0.028),
      material: frame,
      position: [0, 0.12, -0.14],
    },
  );

  return parts;
}

/**
 * 南側スタンドの固定席。
 * オレンジのビニール張りに、焦げ茶の肘掛けと背面シェル、肘掛け先端に白い番号札。
 */
function fixedSeatParts(): ChairPart[] {
  const vinyl = standard(COLOR.standSeat, 0.7);
  const shell = standard(COLOR.standShell, 0.8);
  const arm = standard(COLOR.armrest, 0.7);
  const plate = standard(COLOR.numberPlate, 0.6);
  const parts: ChairPart[] = [
    { geometry: new THREE.BoxGeometry(0.42, 0.1, 0.42), material: vinyl, position: [0, 0.42, 0.02] },
    {
      geometry: new THREE.BoxGeometry(0.42, 0.46, 0.1),
      material: vinyl,
      position: [0, 0.72, 0.19],
      tiltX: 0.12,
    },
    // 背面のシェルと、座面を支える台座。
    {
      geometry: new THREE.BoxGeometry(0.46, 0.5, 0.04),
      material: shell,
      position: [0, 0.72, 0.25],
      tiltX: 0.12,
    },
    { geometry: new THREE.BoxGeometry(0.14, 0.38, 0.16), material: shell, position: [0, 0.19, 0.06] },
  ];

  for (const side of [-1, 1]) {
    parts.push(
      { geometry: new THREE.BoxGeometry(0.06, 0.05, 0.4), material: arm, position: [side * 0.24, 0.62, 0.0] },
      {
        geometry: new THREE.BoxGeometry(0.05, 0.16, 0.05),
        material: arm,
        position: [side * 0.24, 0.52, 0.16],
      },
      // 肘掛け先端の白い番号札。
      {
        geometry: new THREE.BoxGeometry(0.055, 0.07, 0.09),
        material: plate,
        position: [side * 0.24, 0.63, -0.17],
      },
    );
  }

  return parts;
}

/** Y軸に沿った丸パイプ。 */
const tube = (radius: number, length: number) =>
  new THREE.CylinderGeometry(radius, radius, length, 8);

/** 部品ごとに InstancedMesh を1つ作り、各座席の位置・向きに配る。 */
function instancedParts(seats: Seat[], parts: ChairPart[]): THREE.Group {
  const group = new THREE.Group();
  const count = seats.length;
  if (count === 0) return group;

  const local = new THREE.Matrix4();
  const chair = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3(1, 1, 1);

  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, count);
    local.compose(
      position.fromArray(part.position),
      quaternion.setFromEuler(euler.set(part.tiltX ?? 0, 0, 0)),
      scale,
    );

    seats.forEach((seat, index) => {
      chair.compose(
        position.set(seat.x, seat.y, seat.z),
        quaternion.setFromEuler(euler.set(0, OUTWARD_YAW[seat.block.side], 0)),
        scale,
      );
      mesh.setMatrixAt(index, world.multiplyMatrices(chair, local));
    });

    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  return group;
}

function createLights(): THREE.Object3D[] {
  // 試合中の場内は、リングだけがトラスのスポットで明るく、客席は
  // 落とした暖色の灯りでかなり暗い。環境光を上げると陰影が消えて
  // 「昼間の体育館」になってしまうので、全体を低めに抑えてリングとの差で見せる。
  const ambient = new THREE.AmbientLight(0xffeed4, 0.26);
  const sky = new THREE.HemisphereLight(0xffe9cf, 0x2a2119, 0.22);

  // リングを照らすトラスのスポット。
  // 強すぎるとマットの緑が白飛びするので控えめに。
  const key = new THREE.SpotLight(0xfff6e6, 240, 30, Math.PI / 4, 0.6, 1.2);
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
    const lamp = new THREE.PointLight(0xffdcae, 130, 28, 1.6);
    lamp.position.set(x, HALL.ceilingY - 1.0, z);
    house.push(lamp);
  }

  return [ambient, sky, key, key.target, ...house];
}
