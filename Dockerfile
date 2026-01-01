# 推奨バージョンのNode.jsを使用
FROM node:20

# ネイティブモジュール(better-sqlite3)のビルドに必要な依存パッケージをインストール
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    # --- ここからElectron実行用の不足ライブラリ ---
    libgl1 \
    libgl1-mesa-dri \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    libxshmfence1 \
    libx11-xcb1 \

    # ---------------------------------------
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/

WORKDIR /app

# 先にpackage.jsonをコピーしてレイヤーキャッシュを効かせる
COPY package.json ./
RUN npm install

# アプリソースをコピー
COPY . .

# GUIを表示するための設定（Linuxホストの場合に必要）
ENV DISPLAY=:0

CMD ["npm", "start"]