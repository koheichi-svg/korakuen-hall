# korakuen-hall

後楽園ホールの座席表から座席を選ぶと、その席に座ってプロレスを観たときの見え方を3Dで確認できるビューア。

- 初期表示は上から見た座席表。ドラッグで移動、ホイールで拡大縮小。
- 座席をクリック、または入力欄に座席番号（`南側 H列 23番` / `N-K-45` / `リングサイド北 い列 3番`）を入れるとその席の一人称視点になる。
- 3Dビューはドラッグで見回し、ホイールで画角ズーム。`Esc` または「座席表に戻る」で戻る。

## 座席データの出どころ

座席の配置（全1571席）は東京ドームシティ公式の
[後楽園ホールプロレスリング座席表](https://www.tokyo-dome.co.jp/hall/seat/pdf/pdf_pro-wres.pdf)
から起こしている。`npm run build:seats` でPDFを取得し、印字された座席番号の位置を
`src/data/seat-layout.generated.ts` に書き出す（要 `pdftotext`）。

高さ方向（ひな壇の傾斜、リングの高さ、天井）と会場の見た目は、公式サイトの
[座席からの見え方](https://www.tokyo-dome.co.jp/hall/seat/)の写真に合わせた近似。

## 開発

```sh
npm install
npm run dev          # 開発サーバー
npm test             # 座席データ／座席番号パースのテスト
npm run build        # 型チェック + dist/ に静的ファイル出力
npm run build:seats  # 座席データをPDFから再生成
```
