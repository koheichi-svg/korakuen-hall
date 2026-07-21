import { describe, expect, it } from 'vitest';

import { RING } from './hall';
import { BLOCKS, SEATS, getSeat, parseSeatId, seatsInRow } from './seats';

describe('座席データ', () => {
  it('IDが一意', () => {
    expect(new Set(SEATS.map((seat) => seat.id)).size).toBe(SEATS.length);
  });

  it('全席がリングの外側にある', () => {
    for (const seat of SEATS) {
      const distance = Math.max(Math.abs(seat.x), Math.abs(seat.z));
      expect(distance).toBeGreaterThan(RING.apronHalf);
    }
  });

  it('後ろの列ほどリングから遠い', () => {
    for (const block of BLOCKS) {
      const depth = (row: number) => {
        const seat = getSeat(`${block.code}-${row}-1`)!;
        return Math.hypot(seat.x, seat.z);
      };
      for (let row = 2; row <= block.rows; row++) {
        expect(depth(row)).toBeGreaterThan(depth(row - 1));
      }
    }
  });

  it('2階席はアリーナ席より高い位置にある', () => {
    const arena = SEATS.filter((seat) => seat.block.level === 'arena');
    const balcony = SEATS.filter((seat) => seat.block.level === 'balcony');
    expect(Math.max(...arena.map((s) => s.y))).toBeLessThan(
      Math.min(...balcony.map((s) => s.y)),
    );
  });

  it('1番と最終番はブロックの中心線を挟んで対称', () => {
    // アリーナ南(S)。奥行きは +Z、席番は X 方向に並ぶ。
    const block = BLOCKS[0];
    const count = seatsInRow(block, 1);
    const first = getSeat(`${block.code}-1-1`)!;
    const last = getSeat(`${block.code}-1-${count}`)!;

    expect(first.x + last.x).toBeCloseTo(0, 6);
    expect(first.z).toBeCloseTo(block.firstRowDepth, 6);
    expect(last.z).toBeCloseTo(block.firstRowDepth, 6);
    // リングを向いて左端が1番＝-X 側。
    expect(first.x).toBeLessThan(last.x);
  });
});

describe('parseSeatId', () => {
  it('座席IDをそのまま受け付ける', () => {
    expect(parseSeatId('AS-3-12')?.id).toBe('AS-3-12');
    expect(parseSeatId('as-3-12')?.id).toBe('AS-3-12');
    expect(parseSeatId('ＡＳ－３－１２')?.id).toBe('AS-3-12');
  });

  it('日本語表記を受け付ける', () => {
    expect(parseSeatId('2階南 4列 8番')?.id).toBe('BS-4-8');
    expect(parseSeatId('二階南4列8番')?.id).toBe('BS-4-8');
    expect(parseSeatId('アリーナ西 2列 3番')?.id).toBe('AW-2-3');
    expect(parseSeatId('東 1列 1番')?.id).toBe('AE-1-1');
  });

  it('存在しない座席は undefined', () => {
    expect(parseSeatId('ZZ-1-1')).toBeUndefined();
    expect(parseSeatId('AS-99-1')).toBeUndefined();
    expect(parseSeatId('')).toBeUndefined();
    expect(parseSeatId('AS-1')).toBeUndefined();
  });
});
