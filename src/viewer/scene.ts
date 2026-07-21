import * as THREE from 'three';

import { HALL, RING } from '../data/hall';
import { BLOCKS, SEATS, seatsInRow } from '../data/seats';

/**
 * 後楽園ホールを手続き的に組み立てたシーン。
 * 実測モデルではなく、座席ごとの「距離・高さ・角度」が体感できる程度の近似。
 * 座席の座標は data/seats.ts と共有しているので、座席表とズレることはない。
 */
export function createHallScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  scene.add(createShell());
  scene.add(createRing());
  scene.add(createWrestlers());
  scene.add(createBalconyStructure());
  scene.add(createChairs());
  scene.add(...createLights());

  return scene;
}

/** 床・壁・天井・照明トラス。 */
function createShell(): THREE.Group {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL.halfX * 2, HALL.halfZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x272c38,
    roughness: 1,
    side: THREE.BackSide,
  });
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(HALL.halfX * 2, HALL.ceilingY, HALL.halfZ * 2),
    wallMaterial,
  );
  walls.position.y = HALL.ceilingY / 2;
  group.add(walls);

  // 天井の照明トラス。骨組みだけ置くと「屋内の低い天井」感が出る。
  const trussMaterial = new THREE.MeshStandardMaterial({ color: 0x11141c, roughness: 0.8 });
  for (const x of [-6, 0, 6]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, HALL.halfZ * 2), trussMaterial);
    beam.position.set(x, HALL.ceilingY - 0.6, 0);
    group.add(beam);
  }
  for (const z of [-8, 0, 8]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL.halfX * 2, 0.4, 0.4), trussMaterial);
    beam.position.set(0, HALL.ceilingY - 0.6, z);
    group.add(beam);
  }

  const lampGeometry = new THREE.SphereGeometry(0.28, 12, 8);
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
  for (const [x, z] of [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
  ]) {
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.position.set(x, HALL.ceilingY - 1.1, z);
    group.add(lamp);
  }

  return group;
}

/** マット・エプロン・コーナーポスト・ロープ。 */
function createRing(): THREE.Group {
  const group = new THREE.Group();
  const { matHalf, apronHalf, matY, postHeight, ropeHeights } = RING;

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(apronHalf * 2, matY, apronHalf * 2),
    new THREE.MeshStandardMaterial({ color: 0x1c2a5c, roughness: 0.85 }),
  );
  apron.position.y = matY / 2;
  group.add(apron);

  const mat = new THREE.Mesh(
    new THREE.BoxGeometry(apronHalf * 2, 0.12, apronHalf * 2),
    new THREE.MeshStandardMaterial({ color: 0xe8ebf2, roughness: 0.85 }),
  );
  mat.position.y = matY + 0.06;
  mat.receiveShadow = true;
  group.add(mat);

  const canvas = new THREE.Mesh(
    new THREE.BoxGeometry(matHalf * 2, 0.02, matHalf * 2),
    new THREE.MeshStandardMaterial({ color: 0x2f6df6, roughness: 0.8 }),
  );
  canvas.position.y = matY + 0.13;
  group.add(canvas);

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0xb02a2a, roughness: 0.5 });
  const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const corners: [number, number][] = [
    [matHalf, matHalf],
    [matHalf, -matHalf],
    [-matHalf, matHalf],
    [-matHalf, -matHalf],
  ];

  for (const [x, z] of corners) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, postHeight, 10),
      postMaterial,
    );
    post.position.set(x, matY + postHeight / 2, z);
    group.add(post);
  }

  // ロープは4辺 × 3本。辺の向きに合わせて細い箱を伸ばす。
  for (const height of ropeHeights) {
    for (const sign of [1, -1]) {
      const alongX = new THREE.Mesh(
        new THREE.BoxGeometry(matHalf * 2, 0.05, 0.05),
        ropeMaterial,
      );
      alongX.position.set(0, matY + height, sign * matHalf);
      group.add(alongX);

      const alongZ = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, matHalf * 2),
        ropeMaterial,
      );
      alongZ.position.set(sign * matHalf, matY + height, 0);
      group.add(alongZ);
    }
  }

  return group;
}

/** リング上の3人。距離感・遮蔽の目安になるので単純な形でも置いておく。 */
function createWrestlers(): THREE.Group {
  const group = new THREE.Group();
  const y = RING.matY + 0.14;

  const people: [number, number, number, number][] = [
    // [x, z, 身長, 色]
    [-1.0, 0.4, 1.85, 0xd94f4f],
    [1.0, -0.3, 1.9, 0x4f7fd9],
    [2.2, 1.8, 1.75, 0x22262e],
  ];

  for (const [x, z, height, color] of people) {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, height - 0.56, 6, 12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    body.position.set(x, y + height / 2, z);
    body.castShadow = true;
    group.add(body);
  }

  return group;
}

/** 2階席のひな壇と手すり。座席そのものは createChairs が置く。 */
function createBalconyStructure(): THREE.Group {
  const group = new THREE.Group();
  const slabMaterial = new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.95 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.6 });

  for (const block of BLOCKS) {
    if (block.level !== 'balcony') continue;
    const horizontal = block.side === 'E' || block.side === 'W';

    for (let row = 1; row <= block.rows; row++) {
      const depth = block.firstRowDepth + (row - 1) * block.rowPitch;
      const y = block.baseY + (row - 1) * block.riserPitch;
      const width = seatsInRow(block, row) * block.seatPitch;
      const sign = block.side === 'S' || block.side === 'E' ? 1 : -1;

      // 床(y=0)からその列の高さ(y)まで積む。天面がちょうど座席の足元になる。
      const height = y + 0.2;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontal ? block.rowPitch : width,
          height,
          horizontal ? width : block.rowPitch,
        ),
        slabMaterial,
      );
      slab.position.set(
        horizontal ? sign * depth : 0,
        y - height / 2,
        horizontal ? 0 : sign * depth,
      );
      group.add(slab);
    }

    // 最前列の前に転落防止の手すり。ここが視界を切る座席がある。
    const front = block.firstRowDepth - block.rowPitch * 0.6;
    const width = seatsInRow(block, 1) * block.seatPitch;
    const sign = block.side === 'S' || block.side === 'E' ? 1 : -1;
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? 0.12 : width, 1.0, horizontal ? width : 0.12),
      railMaterial,
    );
    rail.position.set(
      horizontal ? sign * front : 0,
      block.baseY + 0.5,
      horizontal ? 0 : sign * front,
    );
    group.add(rail);
  }

  return group;
}

/**
 * 全座席のパイプ椅子。座面と背もたれをそれぞれ InstancedMesh 1個で描く
 * （1500席をMeshで置くとドローコールが破綻するため）。
 */
function createChairs(): THREE.Group {
  const group = new THREE.Group();
  const count = SEATS.length;

  const seatMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.42, 0.05, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x3d4356, roughness: 0.9 }),
    count,
  );
  const backMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.42, 0.42, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: 0.9 }),
    count,
  );

  const dummy = new THREE.Object3D();
  SEATS.forEach((seat, index) => {
    // 椅子のローカル +Z がリングの反対（＝背もたれ側）を向くように回す。
    const yaw = Math.atan2(seat.x, seat.z);

    dummy.position.set(seat.x, seat.y + 0.45, seat.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    seatMesh.setMatrixAt(index, dummy.matrix);

    dummy.position.set(
      seat.x + Math.sin(yaw) * 0.2,
      seat.y + 0.68,
      seat.z + Math.cos(yaw) * 0.2,
    );
    dummy.updateMatrix();
    backMesh.setMatrixAt(index, dummy.matrix);
  });

  seatMesh.instanceMatrix.needsUpdate = true;
  backMesh.instanceMatrix.needsUpdate = true;
  group.add(seatMesh, backMesh);
  return group;
}

function createLights(): THREE.Object3D[] {
  // 客席側は「暗いが形は見える」程度に環境光で起こし、
  // リングだけスポットで明るくして興行中の明暗差を作る。
  const ambient = new THREE.AmbientLight(0x8892ad, 0.9);
  const sky = new THREE.HemisphereLight(0x9fb0d8, 0x1a1d26, 1.0);

  const key = new THREE.SpotLight(0xfff6e0, 700, 40, Math.PI / 4.5, 0.5, 1.5);
  key.position.set(0, HALL.ceilingY - 1.0, 0);
  key.target.position.set(0, RING.matY, 0);

  // 客席上のハウスライト。座席の並びと2階の張り出しを見せるためのもの。
  const house: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-9, -9],
    [9, -9],
    [-9, 9],
    [9, 9],
  ]) {
    const lamp = new THREE.PointLight(0xbfd0ff, 220, 45, 1.7);
    lamp.position.set(x, HALL.ceilingY - 2.0, z);
    house.push(lamp);
  }

  return [ambient, sky, key, key.target, ...house];
}
