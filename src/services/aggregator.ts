import { Balance, AggregatedBalance, TokenDef } from '../types';
import { BalanceProvider } from './providers/interface';
import { PriceService } from './price';

export class AssetAggregator {
  constructor(
    private tokens: TokenDef[],
    private providers: BalanceProvider[],
    private priceService: PriceService
  ) { }

  async aggregate(): Promise<AggregatedBalance[]> {
    const debugEnabled = process.env.WA_DEBUG === '1';

    // 1. Fetch all balances
    const allBalances: Balance[] = [];

    for (const provider of this.providers) {
      const balances = await provider.fetchBalances(this.tokens);
      allBalances.push(...balances);
    }

    if (debugEnabled) {
      console.log(`[DEBUG] 残高明細の取得件数=${allBalances.length} 件`);
    }

    // 2. Fetch Prices
    // Detect all symbols found found in balances (some might be from CEX but not in token config - e.g. JPY)
    // However, PriceProvider needs coingeckoIds from TokenDef.
    // So we rely on TokenDef for price fetching.
    const prices = await this.priceService.fetchPrices(this.tokens);

    // 3. Aggregate
    const grouped = new Map<string, Balance[]>();

    // Normalize symbols?
    // Assume symbols are normalized by providers to match TokenDef or standard codes

    for (const b of allBalances) {
      const existing = grouped.get(b.symbol) || [];
      existing.push(b);
      grouped.set(b.symbol, existing);
    }

    const result: AggregatedBalance[] = [];

    // Keys to iterate: union of Config tokens and Found symbols
    const allSymbols = new Set([...this.tokens.map(t => t.symbol), ...grouped.keys()]);
    const configSymbols = new Set(this.tokens.map(t => t.symbol));

    for (const symbol of allSymbols) {
      // JPYは本ツールの集計対象外（出力不要）
      if (symbol === 'JPY') continue;

      const details = grouped.get(symbol) || [];
      // if details empty and not in token def, skip?
      // if details empty but in token def, output 0? -> Yes for "total" listing consistency if desired, or skip 0s.
      // 設定ファイル（tokens.json）に含まれるトークンは、残高0でも出力する（0であることを確定できるようにする）

      const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);
      if (totalAmount <= 0 && !configSymbols.has(symbol)) continue;

      if (debugEnabled) {
        if (details.length === 0) {
          console.log(`[DEBUG] ${symbol}: 残高0（明細なし）`);
        } else {
          console.log(`[DEBUG] ${symbol}: 合計=${totalAmount} / 明細=${details.length} 件`);
        }
      }

      const price = prices.get(symbol) || 0;
      const value = totalAmount * price;

      result.push({
        symbol,
        totalAmount,
        details,
        priceJpy: price,
        valueJpy: value
      });
    }

    // Sort by Value DESC
    result.sort((a, b) => b.valueJpy - a.valueJpy);

    return result;
  }
}
