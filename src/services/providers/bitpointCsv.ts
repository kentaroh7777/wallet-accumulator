import fs from 'fs';
import { BalanceProvider } from './interface';
import { Balance, TokenDef } from '../../types';

/**
 * BITPOINTのスポット取引CSV（期間指定取引明細）から、最終行（合計＝現在残高）を読み取るプロバイダ。
 *
 * 注意:
 * - CSVがSJISでも、区切り文字「,」と通貨シンボル列（BTC/ETH/...）はASCIIのため、
 *   文字化けしていても解析できる前提で実装している。
 * - 0残高でも「取得できた」ことを確認できるように、0を含めて返す。
 */
export class BitpointCsvProvider implements BalanceProvider {
  private readonly debugEnabled: boolean;

  constructor(
    private readonly csvPath: string,
    private readonly sourceName: string = 'BITPOINT'
  ) {
    this.debugEnabled = process.env.WA_DEBUG === '1';
  }

  async fetchBalances(tokens: TokenDef[]): Promise<Balance[]> {
    const balances: Balance[] = [];

    if (!this.csvPath) {
      if (this.debugEnabled) console.log('[DEBUG] BITPOINT CSV: パス未指定のためスキップ');
      return balances;
    }

    if (!fs.existsSync(this.csvPath)) {
      console.warn(`BITPOINT CSVが見つかりません: ${this.csvPath}`);
      return balances;
    }

    // SJISの可能性があるが、ASCII（カンマ/数字/通貨シンボル）は維持される前提でutf8として読む
    const raw = fs.readFileSync(this.csvPath, 'utf-8');
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length === 0) {
      console.warn(`BITPOINT CSVが空です: ${this.csvPath}`);
      return balances;
    }

    // ヘッダ行（"No,..."）を探す。SJISで日本語が壊れていても "No," はASCIIなので検出できる。
    const headerIndex = lines.findIndex(l => l.startsWith('No,'));
    if (headerIndex < 0) {
      console.warn(`BITPOINT CSVのヘッダ行（No,）が見つかりません: ${this.csvPath}`);
      return balances;
    }

    // 最終行が合計（現在残高）という前提（ユーザー確定）
    const lastLine = lines[lines.length - 1];

    const headerCols = lines[headerIndex].split(',');
    const dataCols = lastLine.split(',');

    const recordNo = dataCols[0] ?? '';

    // tokens.json に載っているトークンだけ対象にする（不要な列を大量に出さない）
    const targetSymbols = new Set(tokens.map(t => t.symbol));

    // ヘッダの列名（BTC/ETH/...）→インデックス
    const symbolToIndex = new Map<string, number>();
    for (let i = 0; i < headerCols.length; i++) {
      const colName = (headerCols[i] ?? '').trim();
      // 通貨列は基本英大文字/数字（例: BTC, ETH, DOGE, PEPE, TON...）
      if (!/^[A-Z0-9][A-Z0-9()]*$/.test(colName)) continue;
      if (colName === 'No') continue;
      symbolToIndex.set(colName, i);
    }

    if (this.debugEnabled) {
      console.log(`[DEBUG] BITPOINT CSV: path=${this.csvPath}`);
      console.log(`[DEBUG] BITPOINT CSV: headerIndex=${headerIndex + 1}行目 / recordNo=${recordNo}`);
      console.log(`[DEBUG] BITPOINT CSV: 検出した通貨列=${symbolToIndex.size} 列`);
    }

    // 対象トークンのみ残高を返す（0も含む）
    for (const symbol of targetSymbols) {
      const idx = symbolToIndex.get(symbol);
      if (idx === undefined) continue;

      const rawValue = (dataCols[idx] ?? '').trim();
      const amount = rawValue.length === 0 ? 0 : Number.parseFloat(rawValue);

      // 数値として解釈できない場合は0扱い（CSVの崩れ対策）
      const safeAmount = Number.isFinite(amount) ? amount : 0;

      balances.push({
        symbol,
        amount: safeAmount,
        sourceType: 'cex',
        sourceName: this.sourceName,
        chain: 'cex',
      });
    }

    if (this.debugEnabled) {
      console.log(`[DEBUG] BITPOINT CSV: 返却残高件数=${balances.length} 件（0含む）`);
    }

    return balances;
  }
}


