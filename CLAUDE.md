# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

後楽園ホールの座席表から席を選び、その席に座ったときのプロレス観戦視点を3Dで確認するビューア。Vite + TypeScript + Three.js、フレームワークなしの静的サイト。

## コマンド

```sh
npm run dev                      # 開発サーバー (http://localhost:5173)
npm test                         # vitest (src/**/*.test.ts)
npx vitest run src/data/seats.test.ts -t 'parseSeatId'   # 単体で実行
npm run build                    # tsc --noEmit + vite build → dist/
npm run typecheck
```

lint は入れていない（tsc の `strict` / `noUnusedLocals` が実質的なチェック）。

## アーキテクチャ

### 座標系がすべての土台

`src/data/hall.ts` と `src/data/seats.ts` が**唯一の座標の出どころ**。2D座席表(SVG)と3Dシーン(Three.js)はどちらもここから同じ `Seat` を読むので、片方だけズレることがない構造になっている。座席の位置・列数・ブロックの広さを変えるときは必ずこの2ファイルを直すこと（SVG側・3D側で個別に数値を持たせない）。

- 右手系 Y-up、単位はメートル、リング中央が原点。`+X`=東 / `+Z`=南 / `+Y`=上。
- 2D座席表は `x → SVGのx`、`z → SVGのy` に素直に落としている（＝南が画面下）。
- `Seat.y` は**床の高さ**。目線は `EYE_HEIGHT` を足して作る（`viewer.moveToSeat`）。

### 座席の生成

座席は列挙データではなく `BLOCK_SPECS`（8ブロック = アリーナ南北東西 + 2階南北東西）から手続き的に生成する。1ブロックは「1列目のリングからの距離 / 列ピッチ / 席ピッチ / 1列目の席数 / 1列あたりの増加数 / ひな壇の段差」で表現され、`buildSeat()` がブロックの向き（`AXES`）を掛けてワールド座標にする。席番号は**リングを向いて左端が1番**。

座席IDは `AS-3-12` 形式（ブロックコード-列-番）。`parseSeatId()` が全角・日本語表記（`2階南 4列 8番`）を吸収する。ブロック名側にも数字が入り得る（`2階南`）ため、**末尾の数字2つを列・番として先に取り、残りをブロック名として解決する**という順序に依存している。ここを普通の前方一致に書き換えると `2階〜` が壊れる。

### 画面構成

`src/main.ts` が座席表パネルとビューアパネルの表示切替と、フォーム入力・ボタン(`data-action`)の配線を持つ。3Dビューアは**最初に席が選ばれるまで生成しない**（起動を軽くするため）。座席表に戻るときは `viewer.stop()` で rAF を止める。

- `src/seatmap/seatmap.ts` — SVG座席表。拡大縮小・移動は `<g>` の transform だけで行い、DOMは作り直さない。1494個の `<rect>` を初回に一度だけ生成する。
- `src/viewer/scene.ts` — ホールの手続き的3Dモデル（リング/椅子/2階ひな壇/天井トラス/照明）。全席の椅子は `InstancedMesh` 2個（座面・背もたれ）で描く。
- `src/viewer/viewer.ts` — 一人称カメラ。カメラ位置は座席に固定し yaw/pitch を直接持つ（OrbitControls は使わない）。ドラッグ=見回し、ホイール=FOVズーム。

### ポインタ操作の注意

座席表・3Dビューとも `setPointerCapture` でドラッグを掴む。キャプチャ中は `click` イベントが個々の `<rect>` ではなく SVG ルートに飛ぶため、**座席の選択は click ではなく pointerup + `document.elementFromPoint()` で解決している**。ここを `click` ハンドラに戻すと座席がクリックできなくなる。ドラッグ距離が閾値を超えたときは選択扱いにしない。

## 会場データの位置づけ

寸法・座席配置は実測図面ではなく、席ごとの距離・高さ・角度の差が体感できる程度の近似値。総座席数は実際の収容人数（約1,800）より少ない。精度を上げる場合も、値は `hall.ts` / `seats.ts` の定数とブロック定義に閉じ込めること。
