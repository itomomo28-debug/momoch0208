#!/usr/bin/env python3
"""Lark (larksuite.com) Drive へ Zoom 録画を分割アップロードするスクリプト。

upload_mac.command（Mac）か upload_windows.bat（Windows）をダブルクリックして起動する。
初回だけ App ID / App Secret を聞かれ、config.json に保存される。
初回はまず一番小さい1本をテストし、確認後に残りをアップロードする。
アップロード済みのファイルは uploaded.json に記録され、再実行時はスキップされる。
"""
import argparse
import json
import sys
import time
import uuid
import urllib.error
import urllib.request
import zlib
from pathlib import Path

BASE_URL = "https://open.larksuite.com/open-apis"
HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"
STATE_PATH = HERE / "uploaded.json"
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".m4a", ".webm"}
MAX_RETRIES = 5
DEFAULT_FOLDER_TOKEN = "DiM5fNFH5l3KJgdWjyJjGYG5prb"
DEFAULT_SOURCE_DIR = "~/Downloads/Zoom録画_Lark用"


class LarkError(Exception):
    pass


def ask(prompt):
    value = input(prompt).strip()
    while not value:
        value = input("  空欄です。もう一度入力してください: ").strip()
    return value


def load_config():
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8")) if CONFIG_PATH.exists() else {}
    if not cfg.get("app_id") or not cfg.get("app_secret"):
        print("最初の1回だけ、Lark アプリの情報を入力します（貼り付けて Enter）。")
        cfg["app_id"] = ask("  App ID: ")
        cfg["app_secret"] = ask("  App Secret: ")
        CONFIG_PATH.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        print("  保存しました。次回からは入力不要です。\n")
    cfg.setdefault("folder_token", DEFAULT_FOLDER_TOKEN)
    cfg.setdefault("source_dir", DEFAULT_SOURCE_DIR)
    return cfg


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(state):
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def request(method, path, token=None, json_body=None, data=None, content_type=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        content_type = "application/json; charset=utf-8"
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw)
        except ValueError:
            raise LarkError(f"HTTP {e.code}: {raw[:300]}")
    if body.get("code") != 0:
        raise LarkError(f"code={body.get('code')} msg={body.get('msg')}")
    return body


def with_retry(label, fn):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn()
        except (LarkError, urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == MAX_RETRIES:
                raise
            wait = 2 ** attempt
            print(f"    {label} 失敗 ({e})。{wait}秒後に再試行 {attempt}/{MAX_RETRIES - 1}")
            time.sleep(wait)


class Client:
    def __init__(self, app_id, app_secret):
        self.app_id = app_id
        self.app_secret = app_secret
        self._token = None
        self._expires_at = 0

    def token(self):
        # tenant_access_token は約2時間で切れるので、残り5分を切ったら取り直す
        if self._token is None or time.time() > self._expires_at - 300:
            body = request("POST", "/auth/v3/tenant_access_token/internal",
                           json_body={"app_id": self.app_id, "app_secret": self.app_secret})
            self._token = body["tenant_access_token"]
            self._expires_at = time.time() + body["expire"]
        return self._token

    def folder_name(self, folder_token):
        body = request("GET", f"/drive/explorer/v2/folder/{folder_token}/meta", token=self.token())
        return body["data"].get("name", "")

    def upload_file(self, path, folder_token):
        size = path.stat().st_size
        prep = with_retry("upload_prepare", lambda: request(
            "POST", "/drive/v1/files/upload_prepare", token=self.token(),
            json_body={"file_name": path.name, "parent_type": "explorer",
                       "parent_node": folder_token, "size": size}))["data"]
        upload_id, block_size, block_num = prep["upload_id"], prep["block_size"], prep["block_num"]

        started = time.time()
        with path.open("rb") as f:
            for seq in range(block_num):
                chunk = f.read(block_size)
                with_retry(f"part {seq + 1}/{block_num}",
                           lambda: self._upload_part(upload_id, seq, chunk))
                done = min((seq + 1) * block_size, size)
                mbps = done / 1024 / 1024 / max(time.time() - started, 0.001)
                print(f"\r    {done / size * 100:5.1f}%  ({done / 1024**2:,.0f}/{size / 1024**2:,.0f} MB, {mbps:.1f} MB/s)",
                      end="", flush=True)
        print()

        fin = with_retry("upload_finish", lambda: request(
            "POST", "/drive/v1/files/upload_finish", token=self.token(),
            json_body={"upload_id": upload_id, "block_num": block_num}))
        return fin["data"]["file_token"]

    def _upload_part(self, upload_id, seq, chunk):
        fields = {"upload_id": upload_id, "seq": str(seq), "size": str(len(chunk)),
                  "checksum": str(zlib.adler32(chunk))}
        boundary = uuid.uuid4().hex
        parts = []
        for name, value in fields.items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"blob\"\r\n"
                     "Content-Type: application/octet-stream\r\n\r\n".encode())
        parts.append(chunk)
        parts.append(f"\r\n--{boundary}--\r\n".encode())
        request("POST", "/drive/v1/files/upload_part", token=self.token(), data=b"".join(parts),
                content_type=f"multipart/form-data; boundary={boundary}")


def list_videos(source_dir):
    d = Path(source_dir).expanduser()
    if not d.is_dir():
        sys.exit(f"動画のフォルダが見つかりません: {d}\n"
                 "「ダウンロード」の中に「Zoom録画_Lark用」フォルダがあるか確認してください。")
    return sorted(p for p in d.iterdir()
                  if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in VIDEO_EXTS)


def upload_all(client, cfg, state, files):
    failed = []
    for i, path in enumerate(files, 1):
        print(f"[{i}/{len(files)}] {path.name} ({path.stat().st_size / 1024**2:,.0f} MB)")
        try:
            file_token = client.upload_file(path, cfg["folder_token"])
        except Exception as e:
            print(f"    ✗ 失敗: {e}")
            failed.append(path.name)
            continue
        state[path.name] = file_token
        save_state(state)
        print("    ✓ 完了")
    return failed


def main():
    ap = argparse.ArgumentParser(description="Lark Drive へ動画を分割アップロード")
    ap.add_argument("--check", action="store_true", help="認証とフォルダの確認のみ")
    args = ap.parse_args()

    cfg = load_config()
    client = Client(cfg["app_id"], cfg["app_secret"])
    videos = list_videos(cfg["source_dir"])
    state = load_state()
    pending = [p for p in videos if p.name not in state]
    total_gb = sum(p.stat().st_size for p in videos) / 1024**3

    print(f"動画: {len(videos)}本 / {total_gb:.1f} GB（アップロード済み {len(videos) - len(pending)}本）")
    try:
        print(f"アップロード先: Lark の「{client.folder_name(cfg['folder_token'])}」フォルダ\n")
    except (LarkError, urllib.error.URLError) as e:
        if "app" in str(e).lower() or "secret" in str(e).lower() or "10003" in str(e) or "10014" in str(e):
            CONFIG_PATH.unlink(missing_ok=True)
            sys.exit(f"Lark へのログインに失敗しました（{e}）。\n"
                     "App ID か App Secret が違うようです。もう一度起動すると入力し直せます。")
        sys.exit(f"Lark のフォルダに入れませんでした（{e}）。\n"
                 "フォルダにアプリを追加したか、アプリに権限を付けて公開したかを確認してください。")

    if args.check:
        print("接続OKです。")
        return
    if not pending:
        print("すべてアップロード済みです。")
        return

    if not state:
        # 初回はまず一番小さい1本だけ試す
        test = min(pending, key=lambda p: p.stat().st_size)
        print("まずテストとして1本だけアップロードします。")
        if upload_all(client, cfg, state, [test]):
            sys.exit("\nテストのアップロードに失敗しました。上のエラーをそのまま Claude に貼ってください。")
        pending.remove(test)
        print("\nテスト成功！ Lark のフォルダにその動画があり、再生できるか確認してください。")
        if not pending:
            return
        input(f"確認できたら Enter を押してください。残り{len(pending)}本のアップロードを始めます（やめる場合はウィンドウを閉じる）: ")
        print()

    failed = upload_all(client, cfg, state, pending)
    print(f"\n完了: {len(pending) - len(failed)}本 / 失敗: {len(failed)}本")
    for name in failed:
        print(f"  - {name}")
    if failed:
        print("もう一度起動すると、失敗した分だけアップロードし直します。")
        sys.exit(1)
    print("すべてのアップロードが終わりました。")


if __name__ == "__main__":
    try:
        main()
    finally:
        if sys.stdin.isatty():
            input("\nEnter を押すとこのウィンドウを閉じます。")
