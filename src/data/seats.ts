import { HALL } from './hall';

export type SeatLevel = 'arena' | 'balcony';
export type SeatSide = 'S' | 'N' | 'E' | 'W';

export interface Seat {
  /** 例: "AS-3-12" (ブロックコード - 列 - 番) */
  id: string;
  block: BlockSpec;
  /** 1始まり。1がリングに最も近い列。 */
  row: number;
  /** 1始まり。リングを向いて左端が1番。 */
  number: number;
  /** ワールド座標の着席位置（床面。目線の高さは EYE_HEIGHT を足す）。 */
  x: number;
  y: number;
  z: number;
}

export interface BlockSpec {
  /** 座席IDの接頭辞。 */
  code: string;
  /** 表示名。 */
  label: string;
  level: SeatLevel;
  side: SeatSide;
  rows: number;
  /** 1列目のリング中心からの距離。 */
  firstRowDepth: number;
  rowPitch: number;
  seatPitch: number;
  firstRowSeats: number;
  /** 1列後ろに下がるごとに増える席数。 */
  seatsGrowth: number;
  /** 1列目の床の高さ。 */
  baseY: number;
  /** ひな壇1段あたりの高さ。アリーナ席は平場なので0。 */
  riserPitch: number;
}

/**
 * ブロックの向き。
 * depth = リングから客席へ向かう単位ベクトル、
 * lateral = 座席番号が増える向き（リングを向いて左→右）。
 */
const AXES: Record<SeatSide, { depth: [number, number]; lateral: [number, number] }> = {
  // [x, z] の2成分のみ。高さは baseY / riserPitch が受け持つ。
  S: { depth: [0, 1], lateral: [1, 0] },
  N: { depth: [0, -1], lateral: [-1, 0] },
  E: { depth: [1, 0], lateral: [0, -1] },
  W: { depth: [-1, 0], lateral: [0, 1] },
};

const BLOCK_SPECS: BlockSpec[] = [
  arena('AS', 'アリーナ南', 'S', 9, 22),
  arena('AN', 'アリーナ北', 'N', 9, 22),
  arena('AE', 'アリーナ東', 'E', 7, 12),
  arena('AW', 'アリーナ西', 'W', 7, 12),
  balcony('BS', '2階南', 'S', 13.2, 34),
  balcony('BN', '2階北', 'N', 13.2, 34),
  balcony('BE', '2階東', 'E', 12.0, 24),
  balcony('BW', '2階西', 'W', 12.0, 24),
];

function arena(
  code: string,
  label: string,
  side: SeatSide,
  rows: number,
  firstRowSeats: number,
): BlockSpec {
  return {
    code,
    label,
    level: 'arena',
    side,
    rows,
    firstRowDepth: 4.8,
    rowPitch: 0.85,
    seatPitch: 0.52,
    firstRowSeats,
    seatsGrowth: 1,
    baseY: 0,
    riserPitch: 0,
  };
}

function balcony(
  code: string,
  label: string,
  side: SeatSide,
  firstRowDepth: number,
  firstRowSeats: number,
): BlockSpec {
  return {
    code,
    label,
    level: 'balcony',
    side,
    rows: 6,
    firstRowDepth,
    rowPitch: 0.95,
    seatPitch: 0.5,
    firstRowSeats,
    seatsGrowth: 2,
    baseY: HALL.balconyBaseY,
    riserPitch: 0.45,
  };
}

/** その列の席数。後ろの列ほど幅が広がる。 */
export function seatsInRow(block: BlockSpec, row: number): number {
  return block.firstRowSeats + (row - 1) * block.seatsGrowth;
}

function buildSeat(block: BlockSpec, row: number, number: number): Seat {
  const axes = AXES[block.side];
  const count = seatsInRow(block, row);
  const depth = block.firstRowDepth + (row - 1) * block.rowPitch;
  const lateral = (number - (count + 1) / 2) * block.seatPitch;

  return {
    id: `${block.code}-${row}-${number}`,
    block,
    row,
    number,
    x: axes.depth[0] * depth + axes.lateral[0] * lateral,
    y: block.baseY + (row - 1) * block.riserPitch,
    z: axes.depth[1] * depth + axes.lateral[1] * lateral,
  };
}

function buildAllSeats(): Seat[] {
  const seats: Seat[] = [];
  for (const block of BLOCK_SPECS) {
    for (let row = 1; row <= block.rows; row++) {
      const count = seatsInRow(block, row);
      for (let number = 1; number <= count; number++) {
        seats.push(buildSeat(block, row, number));
      }
    }
  }
  return seats;
}

export const BLOCKS: readonly BlockSpec[] = BLOCK_SPECS;
export const SEATS: readonly Seat[] = buildAllSeats();

const SEATS_BY_ID = new Map(SEATS.map((seat) => [seat.id, seat]));

export function getSeat(id: string): Seat | undefined {
  return SEATS_BY_ID.get(id);
}

/** 入力欄に打ち込まれた文字列 → 座席。表記ゆれを吸収する。 */
export function parseSeatId(input: string): Seat | undefined {
  const normalized = normalize(input);
  if (!normalized) return undefined;

  // 末尾の「列 番」を数字2つとして取り、その手前をすべてブロック名とみなす。
  // 「2階南」のようにブロック名側にも数字が入るため、後ろから決める。
  const match = /^(.*?)[\s-]*(\d+)[\s-]+(\d+)$/.exec(normalized);
  if (!match) return undefined;

  const code = resolveBlockCode(match[1]);
  if (!code) return undefined;

  return getSeat(`${code}-${Number(match[2])}-${Number(match[3])}`);
}

/** 全角英数を半角化し、「列」「番」などの飾りを区切りに畳む。 */
function normalize(input: string): string {
  return input
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ａ-ｚa-z]/g, (c) => c.toUpperCase())
    // 全角ハイフン類だけを半角化する。カタカナの長音符(ー U+30FC)は「アリーナ」で使うので触らない。
    .replace(/[－−‐-―]/g, '-')
    .replace(/ブロック|列|番|席/g, ' ')
    .replace(/[\s　_/,.-]+/g, ' ')
    .trim();
}

const BLOCK_ALIASES = new Map<string, string>();
for (const block of BLOCK_SPECS) {
  BLOCK_ALIASES.set(block.code, block.code);
  BLOCK_ALIASES.set(block.label, block.code);
}
// 「南」だけならアリーナ、「2階南」「二階南」なら2階。
for (const [side, code] of [
  ['南', 'S'],
  ['北', 'N'],
  ['東', 'E'],
  ['西', 'W'],
] as const) {
  BLOCK_ALIASES.set(side, `A${code}`);
  BLOCK_ALIASES.set(`アリーナ${side}`, `A${code}`);
  BLOCK_ALIASES.set(`1階${side}`, `A${code}`);
  BLOCK_ALIASES.set(`一階${side}`, `A${code}`);
  BLOCK_ALIASES.set(`2階${side}`, `B${code}`);
  BLOCK_ALIASES.set(`二階${side}`, `B${code}`);
  BLOCK_ALIASES.set(`2F${side}`, `B${code}`);
}

function resolveBlockCode(raw: string): string | undefined {
  return BLOCK_ALIASES.get(raw.replace(/\s+/g, ''));
}
