#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { AssetAggregator } from './services/aggregator';
import { TokenConfigLoader } from './config/loader';
import { CsvExporter } from './utils/csv';
import { EvmProvider } from './services/providers/evm';
import { SolanaProvider } from './services/providers/solana';
import { BitcoinProvider } from './services/providers/bitcoin';
import { CexProvider } from './services/providers/cex';
import { BitpointCsvProvider } from './services/providers/bitpointCsv';
import { BalanceProvider } from './services/providers/interface';
import { PriceService } from './services/price';
import fs from 'fs';
import path from 'path';

dotenv.config();

const program = new Command();

program
  .name('wallet-accumulator')
  .description('ウォレットとCEXのトークン残高を集計するツール')
  .version('1.0.0');

program
  .command('init')
  .description('デフォルト設定ファイルを生成します')
  .action(() => {
    const tokens = [
      { symbol: "BTC", native: true, coingeckoId: "bitcoin", chains: { bitcoin: "native" } },
      { symbol: "ETH", native: true, coingeckoId: "ethereum", chains: { ethereum: "native" } },
      { symbol: "SOL", native: true, coingeckoId: "solana", chains: { solana: "native" }, addresses: { solana: "So11111111111111111111111111111111111111112" } },
      { symbol: "USDT", coingeckoId: "tether", decimals: 6, addresses: { ethereum: "0xdac17f958d2ee523a2206206994597c13d831ec7", solana: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" } },
      { symbol: "USDC", coingeckoId: "usd-coin", decimals: 6, addresses: { ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", solana: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } },
      { symbol: "JPY", coingeckoId: "jpy-coin" }
    ];

    if (!fs.existsSync('tokens.json')) {
      fs.writeFileSync('tokens.json', JSON.stringify({ tokens }, null, 2));
      console.log('tokens.json を作成しました。');
    } else {
      console.log('tokens.json は既に存在します。');
    }

    if (!fs.existsSync('wallets.txt')) {
      fs.writeFileSync('wallets.txt', '# ウォレットアドレスを1行ずつ追記してください\n0x...\n');
      console.log('wallets.txt を作成しました。');
    } else {
      console.log('wallets.txt は既に存在します。');
    }

    if (!fs.existsSync('.env')) {
      fs.writeFileSync('.env', '# CEX API Keys\nBITFLYER_API_KEY=\nBITFLYER_API_SECRET=\n');
      console.log('.env を作成しました。');
    } else {
      console.log('.env は既に存在します。');
    }
  });

program
  .option('-w, --wallets <path>', 'ウォレットリストファイルのパス', 'wallets.txt')
  .option('-t, --tokens <path>', 'トークン設定ファイルのパス', 'tokens.json')
  .option('-m, --mode <mode>', '出力モード: total | detail', 'total')
  .option('-o, --output <path>', '出力先CSVファイルのパス', 'result.csv')
  .option('--bitpoint-csv <path>', 'BITPOINTのスポットCSV（最終行=合計）ファイルのパス')
  .action(async (options) => {
    try {
      console.log(`[${options.mode}] モードで集計を開始します...`);
      const debugEnabled = process.env.WA_DEBUG === '1';

      // 1. Load Configurations
      const tokenConfig = TokenConfigLoader.load(options.tokens);
      let wallets: string[] = [];
      if (fs.existsSync(options.wallets)) {
        wallets = fs.readFileSync(options.wallets, 'utf-8')
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'));
      } else {
        console.warn(`警告: ウォレットファイルが見つかりません: ${options.wallets}. CEXのみで実行します。`);
      }

      // 2. Initialize Providers
      const providers: BalanceProvider[] = [
        new EvmProvider(wallets),
        new SolanaProvider(wallets),
        new BitcoinProvider(wallets),
        new CexProvider()
      ];

      const bitpointCsvPath: string | undefined = options.bitpointCsv || process.env.BITPOINT_CSV_PATH;
      if (bitpointCsvPath) {
        console.log(`BITPOINT CSV連携: 有効（path=${bitpointCsvPath}）`);
        providers.push(new BitpointCsvProvider(bitpointCsvPath));
      } else {
        if (debugEnabled) console.log('[DEBUG] BITPOINT CSV連携: 無効（path未指定）');
      }

      const priceService = new PriceService();

      // 3. Aggregate
      const aggregator = new AssetAggregator(tokenConfig.tokens, providers, priceService);
      const results = await aggregator.aggregate();

      // 4. Export
      const exporter = new CsvExporter();
      if (options.mode === 'detail') {
        await exporter.exportDetail(results, options.output);
      } else {
        await exporter.exportTotal(results, options.output);
      }

      console.log(`結果を ${options.output} に出力しました。`);
    } catch (error) {
      console.error('エラーが発生しました:', error);
      process.exit(1);
    }
  });

program.parse();
