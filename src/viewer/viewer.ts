import * as THREE from 'three';

import { EYE_HEIGHT, RING_FOCUS } from '../data/hall';
import type { Seat } from '../data/seats';
import { createCrowd, type Crowd, type CrowdLevel } from './crowd';
import { createHallScene } from './scene';

const MIN_FOV = 22;
const MAX_FOV = 85;
const DEFAULT_FOV = 62;
const MAX_PITCH = THREE.MathUtils.degToRad(80);

export interface SeatViewer {
  /** その座席に着席した状態にする（カメラ位置＝座席、初期の視線＝リング）。 */
  moveToSeat(seat: Seat): void;
  /** 客席の入りを切り替える。 */
  setCrowd(level: CrowdLevel): void;
  /** 視線だけを初期状態（リング正面）に戻す。 */
  recenter(): void;
  /** 描画ループの開始・停止。ビューアを隠している間は止める。 */
  start(): void;
  stop(): void;
}

/**
 * 座席に座った一人称視点。カメラは動かさず首だけ振る操作なので、
 * OrbitControls ではなく yaw / pitch を直接持つ。
 *   ドラッグ = 首を振る / ホイール = 画角(FOV)ズーム
 */
export function createSeatViewer(container: HTMLElement): SeatViewer {
  const { scene, update } = createHallScene();
  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.84;
  container.append(renderer.domElement);

  let yaw = 0;
  let pitch = 0;
  /** 座席ごとの初期視線。recenter() で戻る先。 */
  let homeYaw = 0;
  let homePitch = 0;

  const applyOrientation = () => {
    camera.rotation.y = yaw;
    camera.rotation.x = THREE.MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH);
  };

  const resize = () => {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const canvas = renderer.domElement;
  const zoomTo = (fov: number) => {
    camera.fov = THREE.MathUtils.clamp(fov, MIN_FOV, MAX_FOV);
    camera.updateProjectionMatrix();
  };

  // 触れている指を全部覚えておく。1本なら見回し、2本ならピンチでズーム。
  const pointers = new Map<number, { x: number; y: number }>();
  /** ピンチ開始時の指の間隔と画角。 */
  let pinch: { spread: number; fov: number } | undefined;

  const spreadOf = () => {
    const list = [...pointers.values()];
    return list.length < 2 ? 0 : Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  };
  const beginPinch = () => {
    const spread = spreadOf();
    pinch = spread > 0 ? { spread, fov: camera.fov } : undefined;
  };

  canvas.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
    beginPinch();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinch) {
      // 指を広げるほど画角が狭くなる＝寄る。
      const spread = spreadOf();
      if (spread > 0) zoomTo((pinch.fov * pinch.spread) / spread);
      return;
    }
    // ドラッグした方向に景色が付いてくる（＝首はその逆に振れる）向き。
    const speed = (camera.fov / DEFAULT_FOV) * 0.004;
    yaw += event.movementX * speed;
    pitch += event.movementY * speed;
    applyOrientation();
  });

  const endDrag = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    canvas.releasePointerCapture(event.pointerId);
    if (pointers.size === 0) canvas.classList.remove('is-dragging');
    // 指が1本に減ったらピンチをやめて見回しに戻す。
    beginPinch();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomTo(camera.fov * Math.exp(event.deltaY * 0.0012));
  });

  // 試合の時計。座席表に戻っている間は止めたいので、経過時間は自分で積む。
  const clock = new THREE.Clock();
  let elapsed = 0;

  let frame: number | undefined;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    // タブが裏に回ると delta が跳ねるので上限を切る。
    elapsed += Math.min(clock.getDelta(), 0.1);
    update(elapsed);
    renderer.render(scene, camera);
  };

  // 観客。段階ごとに一度だけ組み立てて使い回す（毎回作り直すと切り替えが重い）。
  const crowds = new Map<CrowdLevel, Crowd>();
  let crowd: Crowd | undefined;
  let seatId: string | undefined;

  const setCrowd = (level: CrowdLevel) => {
    if (crowd) scene.remove(crowd.group);
    let next = crowds.get(level);
    if (!next) {
      next = createCrowd(level);
      crowds.set(level, next);
    }
    next.setEmptySeat(seatId);
    scene.add(next.group);
    crowd = next;
  };

  return {
    moveToSeat(seat) {
      camera.position.set(seat.x, seat.y + EYE_HEIGHT, seat.z);
      // 自分の席の観客は消す（頭が目の前に来てしまうため）。
      seatId = seat.id;
      crowd?.setEmptySeat(seatId);

      const target = new THREE.Vector3(...RING_FOCUS);
      const toRing = target.sub(camera.position);
      homeYaw = Math.atan2(-toRing.x, -toRing.z);
      homePitch = Math.asin(toRing.y / toRing.length());

      yaw = homeYaw;
      pitch = homePitch;
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
      applyOrientation();
    },
    setCrowd,
    recenter() {
      yaw = homeYaw;
      pitch = homePitch;
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
      applyOrientation();
    },
    start() {
      if (frame !== undefined) return;
      clock.getDelta(); // 止めていた間ぶんを捨てる。
      loop();
    },
    stop() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    },
  };
}
