# Lark Drive 動画アップローダー

`~/Downloads/Zoom録画_Lark用` の動画を、Lark（larksuite.com）ドライブに分割アップロード（upload_prepare / upload_part / upload_finish）します。Python 3.8 以降で動き、追加パッケージは不要です。

## 準備

1. [Lark Developer Console](https://open.larksuite.com/app) でカスタムアプリを作り、権限 `drive:drive`（または `drive:file:upload`）を追加してアプリを公開します。
2. Lark ドライブでアップロード先フォルダを開き、「共有」または「…」→「ドキュメントアプリを追加」からアプリに**編集権限**を付けます。
3. `config.example.json` をコピーして `config.json` を作り、次の項目を入力します。
   - `app_id` / `app_secret`：開発者コンソールの「認証情報と基本情報」に表示されている値
   - `folder_token`：フォルダ URL `https://xxx.larksuite.com/drive/folder/XXXX` の `XXXX` の部分

`config.json` と `uploaded.json` は git の管理対象から外してあります。

## 実行

```bash
python3 lark_upload.py --check   # 認証とフォルダ名の確認だけ（アップロードしない）
python3 lark_upload.py --test    # 一番小さい1本だけアップロード
python3 lark_upload.py           # 残りを全部アップロード
```

アップロードが済んだファイルは `uploaded.json` に記録され、再実行するとスキップされます。途中で止まったり失敗したりしても、同じコマンドを実行し直せば続きから進みます。
