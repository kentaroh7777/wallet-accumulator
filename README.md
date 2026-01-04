# wallet-accumulator
Wallet token accumulation

## 概要
ウォレット（EVM / Solana / Bitcoin）と、取引所（CEX）およびBITPOINTのCSV（スポット）からトークン残高を集計し、CSVとして出力するCLIです。

## セットアップ
### 1. 依存関係のインストール
```bash
npm install
```

### 2. 設定ファイル
- `wallets.txt`: 監視したいウォレットアドレスを1行ずつ記載
  - `0x...`（EVM）、`bc1...`（Bitcoin）、Solanaアドレス（Base58）を混在OK
- `tokens.json`: 取得対象トークン定義（`symbol` / `addresses` / `native` など）

初期ファイルを作る場合:
```bash
./scripts/wa init
```

## 集計実行（基本）
```bash
./scripts/wa
```

## よく使う実行例
### 1) 合計（total）を出力
```bash
./scripts/wa --mode total --output result.csv
```

### 2) 明細（detail）を出力
```bash
./scripts/wa --mode detail --output result.csv
```

### 3) BITPOINT CSV（スポット）を取り込む
```bash
./scripts/wa --mode detail --bitpoint-csv tests/samples/bitpoint-Spot_20250101_20251231.csv --output result.csv
```

## オプション
- `-w, --wallets <path>`: ウォレットリストファイル（デフォルト `wallets.txt`）
- `-t, --tokens <path>`: トークン設定ファイル（デフォルト `tokens.json`）
- `-m, --mode <mode>`: 出力モード `total` / `detail`（デフォルト `total`）
- `-o, --output <path>`: 出力CSV（デフォルト `result.csv`）
- `--bitpoint-csv <path>`: BITPOINTスポットCSV（最終行=合計（現在残高））のファイルパス

## 環境変数
- `BITPOINT_CSV_PATH`: `--bitpoint-csv` の代替指定（CLIが優先）
- `WA_DEBUG=1`: デバッグログを有効化（decimals取得・0残高判定などを表示）

## 出力（CSV）
- 出力CSVは **デフォルトでShift_JIS（SJIS）** です（Excelで開きやすい想定）
- 改行はCRLFです
- `detail` モードでは、残高0のトークンも「0であることを確定」できるように **1行（`wallet` / 空欄 / 0）** を出力します

## BITPOINT CSV連携について
- 本ツールはBITPOINTの公開API（認証付き残高取得）ではなく、**BITPOINTサイトからダウンロードしたスポットCSV**を取り込みます
- CSVがSJISでも、カンマ区切り・通貨列（BTC/ETH/...）はASCIIのため読み取り可能な前提です
- **最終行が「合計（現在残高）」**である前提で、その行から残高を抽出します
```
