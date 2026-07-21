import * as THREE from 'three';

import { EYE_HEIGHT, RING_FOCUS } from '../data/hall';
import type { Seat } from '../data/seats';
import { createHallScene } from './scene';

const MIN_FOV = 22;
const MAX_FOV = 85;
const DEFAULT_FOV = 62;
const MAX_PITCH = THREE.MathUtils.degToRad(80);

export interface SeatViewer {
  /** その座席に着席した状態にする（カメラ位置＝座席、初期の視線＝リング）。 */
  moveToSeat(seat: Seat): void;
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
  const scene = createHallScene();
  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.05, 200);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
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

  let dragPointer: number | undefined;
  const canvas = renderer.domElement;

  canvas.addEventListener('pointerdown', (event) => {
    if (dragPointer !== undefined) return;
    dragPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== dragPointer) return;
    // ドラッグした方向に景色が付いてくる（＝首はその逆に振れる）向き。
    const speed = (camera.fov / DEFAULT_FOV) * 0.004;
    yaw += event.movementX * speed;
    pitch += event.movementY * speed;
    applyOrientation();
  });

  const endDrag = (event: PointerEvent) => {
    if (event.pointerId !== dragPointer) return;
    dragPointer = undefined;
    canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    camera.fov = THREE.MathUtils.clamp(
      camera.fov * Math.exp(event.deltaY * 0.0012),
      MIN_FOV,
      MAX_FOV,
    );
    camera.updateProjectionMatrix();
  });

  let frame: number | undefined;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    renderer.render(scene, camera);
  };

  return {
    moveToSeat(seat) {
      camera.position.set(seat.x, seat.y + EYE_HEIGHT, seat.z);

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
    recenter() {
      yaw = homeYaw;
      pitch = homePitch;
      camera.fov = DEFAULT_FOV;
      camera.updateProjectionMatrix();
      applyOrientation();
    },
    start() {
      if (frame === undefined) loop();
    },
    stop() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    },
  };
}
