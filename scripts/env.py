"""
リポジトリ直下の .env を読み込んで環境変数に入れる（python-dotenv を使わない最小実装）

  from env import load_env
  load_env()

- 書式は KEY=VALUE（`export ` 接頭辞・引用符・# コメント・空行に対応）
- すでに設定されている環境変数は上書きしない（シェルで export した値が優先）
- .env が無ければ何もしない。雛形はリポジトリ直下の .env_template
"""
import os

ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")


def load_env(path: str = ENV_PATH) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export "):]
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            os.environ.setdefault(key, value)
