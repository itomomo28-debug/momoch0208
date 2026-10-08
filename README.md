# Reel Studio

写真や動画を選び、Instagram Reels向けの9:16 MP4へ変換するWebアプリです。

4つの顧客ワークスペースを切り替え、案件名とブランド背景色を顧客ごとに保存できます。設定は現在のブラウザ内に保存されます。

## 起動

Node.js 20以降とFFmpegが必要です。

```bash
npm install
npm start
```

ブラウザで `http://localhost:3000` を開きます。

## 出力仕様

- 1080 × 1920 px
- 30 fps
- H.264 / MP4
- 最大12素材、1素材あたり最大150 MB
