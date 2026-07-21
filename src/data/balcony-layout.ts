import { BALCONY } from './hall';
import type { SeatRowLayout } from './seat-layout.generated';

/**
 * 2階バルコニー席（東・西）の座席配置。
 *
 * 公式の座席表PDFはアリーナだけで、バルコニーは載っていない。
 * ここだけは写真から起こした手書きのデータで、生成ファイルとは分けてある
 * （seat-layout.generated.ts は自動生成なので混ぜない）。
 *
 * 並びは東西の壁沿いに2列。番号の向きは1階の東西スタンドに合わせて、
 * 東は北から、西は南から数える。高さは他のブロックと同じく実行時に計算する。
 */

/** 前列（A）と後列（B）の壁からの位置。 */
const ROW_X = { A: 12.3, B: 13.1 } as const;
const SEATS_PER_ROW = 20;
const PITCH = 0.5;

function balconyRow(side: 'E' | 'W', row: 'A' | 'B'): SeatRowLayout {
  const x = ROW_X[row] * (side === 'E' ? 1 : -1);
  const span = (SEATS_PER_ROW - 1) * PITCH;
  // 東は北端(-z)が1番、西は南端(+z)が1番。
  const start = side === 'E' ? -span / 2 : span / 2;
  const step = side === 'E' ? PITCH : -PITCH;

  return {
    block: side === 'E' ? 'BALCONY_E' : 'BALCONY_W',
    row,
    seats: Array.from(
      { length: SEATS_PER_ROW },
      (_, index) => [index + 1, x, round(start + index * step)] as [number, number, number],
    ),
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export const BALCONY_ROW_LAYOUT: SeatRowLayout[] = [
  balconyRow('E', 'A'),
  balconyRow('E', 'B'),
  balconyRow('W', 'A'),
  balconyRow('W', 'B'),
];

// 席が開口からはみ出していないか（座席表PDFの検算と同じ趣旨のチェック）。
for (const row of BALCONY_ROW_LAYOUT) {
  for (const [, x, z] of row.seats) {
    const depth = Math.abs(x);
    if (z < BALCONY.minZ || z > BALCONY.maxZ || depth < BALCONY.innerX || depth > BALCONY.outerX) {
      throw new Error(`バルコニー席がバルコニーの外にある: ${row.block} ${row.row} (${x}, ${z})`);
    }
  }
}
