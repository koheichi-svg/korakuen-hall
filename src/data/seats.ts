import { BALCONY_ROW_LAYOUT } from './balcony-layout';
import { RAKE } from './hall';
import { SEAT_ROW_LAYOUT } from './seat-layout.generated';

export type Side = 'N' | 'S' | 'E' | 'W';
/**
 * 床の高さの決まり方。
 * flat = 平場（高さ0、リングサイド）、stand = ひな壇・スタンド、balcony = 2階バルコニー。
 */
export type BlockKind = 'flat' | 'stand' | 'balcony';
/** そのブロックに置いてある椅子。3Dの見た目はこれで決まる。 */
export type Furniture = 'folding' | 'fixed' | 'bench';

export interface BlockSpec {
  /** 座席IDの接頭辞。 */
  code: string;
  /** 生成データ側のブロック名。 */
  source: string;
  label: string;
  side: Side;
  kind: BlockKind;
  furniture: Furniture;
  /** 入力欄で受け付ける別名（空白を除いた形で比較する）。 */
  aliases: string[];
  /** 「列」の呼び方。座席の表示や案内に使う。 */
  rowUnit: '列';
}

export interface SeatRow {
  block: BlockSpec;
  row: string;
  /** リング中央からブロックの奥行き方向に測った距離。 */
  depth: number;
  /** その列の床の高さ。 */
  y: number;
  seats: Seat[];
}

export interface Seat {
  /** 例: "S-A-12", "RN-い-3" */
  id: string;
  block: BlockSpec;
  row: string;
  number: number;
  x: number;
  /** 床の高さ。目線は EYE_HEIGHT を足す。 */
  y: number;
  z: number;
}

const BLOCK_SPECS: BlockSpec[] = [
  block('S', 'SOUTH', '南側', 'S', 'stand', 'fixed', [
    'S',
    '南',
    '南側',
    '南側スタンド',
    '南スタンド',
  ]),
  block('N', 'NORTH', '北側', 'N', 'stand', 'bench', [
    'N',
    '北',
    '北側',
    '北側スタンド',
    '北スタンド',
  ]),
  block('E', 'EAST', '東側', 'E', 'stand', 'bench', [
    'E',
    '東',
    '東側',
    '東側スタンド',
    '東スタンド',
  ]),
  block('W', 'WEST', '西側', 'W', 'stand', 'bench', [
    'W',
    '西',
    '西側',
    '西側スタンド',
    '西スタンド',
  ]),
  // ステージ席はひな壇の上だが、置いてあるのはリングサイドと同じ折りたたみ椅子。
  block('STE', 'STAGE_E', 'ステージ席(東)', 'N', 'stand', 'folding', [
    'STE',
    'ステージ東',
    'ステージ席東',
    '東ステージ',
  ]),
  block('STW', 'STAGE_W', 'ステージ席(西)', 'N', 'stand', 'folding', [
    'STW',
    'ステージ西',
    'ステージ席西',
    '西ステージ',
  ]),
  block('BE', 'BALCONY_E', 'バルコニー席(東)', 'E', 'balcony', 'folding', [
    'BE',
    'バルコニー東',
    'バルコニー席東',
    '東バルコニー',
    '2階東',
  ]),
  block('BW', 'BALCONY_W', 'バルコニー席(西)', 'W', 'balcony', 'folding', [
    'BW',
    'バルコニー西',
    'バルコニー席西',
    '西バルコニー',
    '2階西',
  ]),
  block('RN', 'RINGSIDE_N', '北側リングサイド', 'N', 'flat', 'folding', [
    'RN',
    '北リングサイド',
    '北側リングサイド',
    'リングサイド北',
  ]),
  block('RS', 'RINGSIDE_S', '南側リングサイド', 'S', 'flat', 'folding', [
    'RS',
    '南リングサイド',
    '南側リングサイド',
    'リングサイド南',
  ]),
  block('RE', 'RINGSIDE_E', '東側リングサイド', 'E', 'flat', 'folding', [
    'RE',
    '東リングサイド',
    '東側リングサイド',
    'リングサイド東',
  ]),
  block('RW', 'RINGSIDE_W', '西側リングサイド', 'W', 'flat', 'folding', [
    'RW',
    '西リングサイド',
    '西側リングサイド',
    'リングサイド西',
  ]),
];

function block(
  code: string,
  source: string,
  label: string,
  side: Side,
  kind: BlockKind,
  furniture: Furniture,
  aliases: string[],
): BlockSpec {
  return { code, source, label, side, kind, furniture, aliases, rowUnit: '列' };
}

/** その席がブロックの奥行き方向にどれだけ離れているか。 */
function depthOf(side: Side, x: number, z: number): number {
  switch (side) {
    case 'N':
      return -z;
    case 'S':
      return z;
    case 'E':
      return x;
    case 'W':
      return -x;
  }
}

const RAKE_BY_SIDE = { N: RAKE.north, S: RAKE.south, E: RAKE.east, W: RAKE.west } as const;

function buildRows(): SeatRow[] {
  const specsBySource = new Map(BLOCK_SPECS.map((spec) => [spec.source, spec]));

  const rows = [...SEAT_ROW_LAYOUT, ...BALCONY_ROW_LAYOUT].map((layout) => {
    const spec = specsBySource.get(layout.block);
    if (!spec) throw new Error(`未知のブロック: ${layout.block}`);
    const depth =
      layout.seats.reduce((sum, [, x, z]) => sum + depthOf(spec.side, x, z), 0) /
      layout.seats.length;
    return { block: spec, row: layout.row, depth, y: 0, seats: [] as Seat[], layout };
  });

  // 斜面の起点は、その側のスタンドの最前列。ステージ席は北側スタンドの斜面に乗る。
  // バルコニーは2階の別の床なので、同じ側でもスタンドとは起点を分ける。
  const rakeKey = (spec: BlockSpec) => `${spec.kind}:${spec.side}`;
  const frontDepth = new Map<string, number>();
  for (const row of rows) {
    if (row.block.kind === 'flat') continue;
    const key = rakeKey(row.block);
    const current = frontDepth.get(key);
    if (current === undefined || row.depth < current) frontDepth.set(key, row.depth);
  }

  for (const row of rows) {
    if (row.block.kind === 'flat') {
      row.y = 0;
    } else {
      const rake = row.block.kind === 'balcony' ? RAKE.balcony : RAKE_BY_SIDE[row.block.side];
      const front = frontDepth.get(rakeKey(row.block)) ?? row.depth;
      row.y = round(rake.base + Math.max(0, row.depth - front) * rake.slope);
    }

    row.seats = row.layout.seats.map(([number, x, z]) => ({
      id: `${row.block.code}-${row.row}-${number}`,
      block: row.block,
      row: row.row,
      number,
      x,
      y: row.y,
      z,
    }));
  }

  return rows.map(({ block: spec, row, depth, y, seats }) => ({
    block: spec,
    row,
    depth,
    y,
    seats,
  }));
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export const BLOCKS: readonly BlockSpec[] = BLOCK_SPECS;
export const SEAT_ROWS: readonly SeatRow[] = buildRows();
export const SEATS: readonly Seat[] = SEAT_ROWS.flatMap((row) => row.seats);

const SEATS_BY_ID = new Map(SEATS.map((seat) => [seat.id, seat]));

export function getSeat(id: string): Seat | undefined {
  return SEATS_BY_ID.get(id);
}

export function seatLabel(seat: Seat): string {
  return `${seat.block.label} ${seat.row}列 ${seat.number}番`;
}

/** ブロックに属する列を、リングに近い順に返す。 */
export function rowsOfBlock(block: BlockSpec): SeatRow[] {
  return SEAT_ROWS.filter((row) => row.block === block).sort((a, b) => a.depth - b.depth);
}

/**
 * 入力欄の文字列から座席を引く。
 * 「S-A-12」「南A12」「南側 A列 12番」「リングサイド北 い列 3番」などを受け付ける。
 */
export function parseSeatId(input: string): Seat | undefined {
  const compact = normalize(input).replace(/\s+/g, '');
  const digits = /(\d+)$/.exec(compact)?.[1];
  if (!digits) return undefined;

  // ステージ席は列名も数字（「ステージ席東 2列 15番」→ "ステージ東215"）なので、
  // 末尾の数字のどこまでが座席番号かは決め打ちできない。長い方から順に試して、
  // 実在する座席になった組み合わせを採用する。
  for (let take = digits.length; take >= 1; take--) {
    const number = Number(digits.slice(digits.length - take));
    const head = compact.slice(0, compact.length - take);

    for (const { spec, alias } of ALIASES) {
      if (!head.startsWith(alias)) continue;
      const row = head.slice(alias.length);
      if (row === '') {
        // 「ステージ席(東) 15番」のように列を言わない書き方。
        // ブロック内で番号が一意なときだけ受け付ける。
        const matches = SEATS.filter((seat) => seat.block === spec && seat.number === number);
        if (matches.length === 1) return matches[0];
        continue;
      }
      const seat = getSeat(`${spec.code}-${row}-${number}`);
      if (seat) return seat;
    }
  }
  return undefined;
}

/** ブロック名の別名。長いものから当てる（"南"は"南側リングサイド"の接頭辞でもあるため）。 */
const ALIASES = BLOCK_SPECS.flatMap((spec) =>
  spec.aliases.map((alias) => ({ spec, alias: normalize(alias).replace(/\s+/g, '') })),
).sort((a, b) => b.alias.length - a.alias.length);

/** 全角英数を半角に、飾り文字を空白に畳む。カタカナの長音符(ー)は残す。 */
function normalize(input: string): string {
  return input
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[a-z]/g, (c) => c.toUpperCase())
    .replace(/[－−‐-―]/g, ' ')
    .replace(/ブロック|列|番|席/g, ' ')
    .replace(/[-()（）\s　_/,.]+/g, ' ')
    .trim();
}
