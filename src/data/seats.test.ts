import { describe, expect, it } from 'vitest';

import { BALCONY, RING, RINGSIDE } from './hall';
import { BLOCKS, SEAT_ROWS, SEATS, getSeat, parseSeatId, rowsOfBlock } from './seats';

const block = (code: string) => BLOCKS.find((b) => b.code === code)!;

describe('座席データ', () => {
  it('公式座席表と同じ席数・列構成', () => {
    // 座席表PDFから起こした数。抽出やブロック分けが壊れたら気付けるようにしておく。
    // バルコニー席はPDFに載っていない手書きデータなので、この数には含めない。
    expect(SEATS.filter((seat) => seat.block.kind !== 'balcony').length).toBe(1571);
    expect(rowsOfBlock(block('S')).map((r) => r.row).join('')).toBe('ABCDEFGHIJKLMNOPQR');
    expect(rowsOfBlock(block('N')).map((r) => r.row).join('')).toBe('ABCDEFGHIJK');
    expect(rowsOfBlock(block('E')).map((r) => r.row).join('')).toBe('ABCDE');
    expect(rowsOfBlock(block('RE')).map((r) => r.row).join('')).toBe('いろはに');
    expect(getSeat('N-K-45')).toBeDefined();
    expect(getSeat('N-K-46')).toBeUndefined();
    // 南側の通路がある列(I〜L)は席数が少ない。
    expect(rowsOfBlock(block('S')).find((r) => r.row === 'H')!.seats.length).toBe(46);
    expect(rowsOfBlock(block('S')).find((r) => r.row === 'I')!.seats.length).toBe(34);
  });

  it('バルコニー席は列を持たない1列で、2階の高さにある', () => {
    for (const code of ['BE', 'BW']) {
      const rows = rowsOfBlock(block(code));
      expect(rows.length).toBe(1);
      expect(rows[0].row).toBe('');
      expect(rows[0].y).toBe(BALCONY.floorY);
      expect(rows[0].seats.length).toBe(20);
      // 列がないぶんIDにも列が入らない。
      expect(rows[0].seats[4].id).toBe(`${code}-5`);
    }
    // 真下にある東側スタンドの最後列より、はっきり上にある。
    const eastBack = rowsOfBlock(block('E')).at(-1)!;
    expect(rowsOfBlock(block('BE'))[0].y).toBeGreaterThan(eastBack.y + 2);
  });

  it('リングサイド最前列はリング脇の柵より外側にある', () => {
    for (const code of ['RN', 'RS', 'RE', 'RW']) {
      const front = rowsOfBlock(block(code))[0];
      // 黒いマットと柵のぶんだけ座席表の位置から下げてある。
      expect(front.depth).toBeGreaterThan(RINGSIDE.barrier + 0.3);
    }
  });

  it('IDが一意', () => {
    expect(new Set(SEATS.map((seat) => seat.id)).size).toBe(SEATS.length);
  });

  it('全席がリングの外側にある', () => {
    for (const seat of SEATS) {
      expect(Math.max(Math.abs(seat.x), Math.abs(seat.z))).toBeGreaterThan(RING.apronHalf);
    }
  });

  it('リングサイドは平場、スタンドは奥ほど高い', () => {
    for (const row of SEAT_ROWS) {
      if (row.block.kind === 'flat') expect(row.y).toBe(0);
    }
    for (const spec of BLOCKS) {
      if (spec.kind !== 'stand') continue;
      const rows = rowsOfBlock(spec);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].y).toBeGreaterThan(rows[i - 1].y);
      }
    }
    // ステージ席は北側スタンドの斜面の途中に乗る。
    const stageFront = rowsOfBlock(block('STE'))[0];
    const northRows = rowsOfBlock(block('N'));
    expect(stageFront.y).toBeGreaterThan(northRows[0].y);
    expect(stageFront.y).toBeLessThan(northRows[northRows.length - 1].y);
  });

  it('南側は北側より奥行きが深い（リングは北寄り）', () => {
    const southBack = rowsOfBlock(block('S')).at(-1)!;
    const northBack = rowsOfBlock(block('N')).at(-1)!;
    expect(southBack.depth).toBeGreaterThan(northBack.depth);
  });

  it('列の中で座席番号が座標順に並ぶ', () => {
    // 東側は北から1番、西側は南から1番（公式座席表どおり）。
    const east = rowsOfBlock(block('RE')).find((r) => r.row === 'に')!;
    expect(east.seats[0].z).toBeLessThan(east.seats.at(-1)!.z);
    const west = rowsOfBlock(block('RW')).find((r) => r.row === 'に')!;
    expect(west.seats[0].z).toBeGreaterThan(west.seats.at(-1)!.z);
    // 南側スタンドは東から1番。
    const south = rowsOfBlock(block('S'))[0];
    expect(south.seats[0].x).toBeGreaterThan(south.seats.at(-1)!.x);
  });
});

describe('parseSeatId', () => {
  it('座席IDをそのまま受け付ける', () => {
    expect(parseSeatId('S-A-12')?.id).toBe('S-A-12');
    expect(parseSeatId('s-a-12')?.id).toBe('S-A-12');
    expect(parseSeatId('Ｓ－Ａ－１２')?.id).toBe('S-A-12');
    expect(parseSeatId('SA12')?.id).toBe('S-A-12');
  });

  it('日本語表記を受け付ける', () => {
    expect(parseSeatId('南側 A列 12番')?.id).toBe('S-A-12');
    expect(parseSeatId('南A12')?.id).toBe('S-A-12');
    expect(parseSeatId('北側 K列 45番')?.id).toBe('N-K-45');
    expect(parseSeatId('西側スタンド E列 25番')?.id).toBe('W-E-25');
    expect(parseSeatId('ステージ席(東) 2列 15番')?.id).toBe('STE-2-15');
    expect(parseSeatId('ステージ席(東) 15番')?.id).toBe('STE-2-15');
    expect(parseSeatId('リングサイド北 い列 3番')?.id).toBe('RN-い-3');
    expect(parseSeatId('南側リングサイド は列 28番')?.id).toBe('RS-は-28');
    expect(parseSeatId('バルコニー席東 5番')?.id).toBe('BE-5');
    expect(parseSeatId('BE-5')?.id).toBe('BE-5');
    expect(parseSeatId('西バルコニー 20')?.id).toBe('BW-20');
  });

  it('存在しない座席は undefined', () => {
    expect(parseSeatId('ZZ-1-1')).toBeUndefined();
    expect(parseSeatId('南側 Z列 1番')).toBeUndefined();
    expect(parseSeatId('南側 A列 99番')).toBeUndefined();
    expect(parseSeatId('')).toBeUndefined();
    expect(parseSeatId('12')).toBeUndefined();
  });
});
