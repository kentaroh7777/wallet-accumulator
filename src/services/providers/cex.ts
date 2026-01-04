import ccxt, { Exchange } from 'ccxt';
import { BalanceProvider } from './interface';
import { Balance, TokenDef } from '../../types';

export class CexProvider implements BalanceProvider {
  private exchanges: Exchange[];

  constructor() {
    this.exchanges = [];
    this.initExchanges();
  }

  private initExchanges() {
    // Check supported exchanges in ENV
    const supported = ['bitflyer', 'coincheck', 'bitbank', 'liquid', 'binance', 'bybit'];

    for (const exId of supported) {
      const apiKey = process.env[`${exId.toUpperCase()}_API_KEY`];
      const secret = process.env[`${exId.toUpperCase()}_API_SECRET`];

      if (apiKey && secret && ccxt[exId as keyof typeof ccxt]) {
        try {
          // @ts-ignore
          const exchangeClass = ccxt[exId];
          const exchange = new exchangeClass({
            apiKey: apiKey,
            secret: secret,
          });
          this.exchanges.push(exchange);
          console.log(`Enabled CEX: ${exId}`);
        } catch (e) {
          console.error(`Failed to initialize ${exId}:`, e);
        }
      }
    }
  }

  async fetchBalances(tokens: TokenDef[]): Promise<Balance[]> {
    const balances: Balance[] = [];

    if (this.exchanges.length === 0) return [];

    console.log(`Fetching CEX balances from ${this.exchanges.length} exchanges...`);

    const targetSymbols = new Set(tokens.map(t => t.symbol));
    // Also include JPY
    targetSymbols.add('JPY');

    for (const exchange of this.exchanges) {
      try {
        const balance = await exchange.fetchBalance();

        // Iterate over total balances
        for (const [code, amount] of Object.entries(balance.total)) {
          // ccxt uses standard codes (BTC, ETH, JPY, etc.)
          // Check if this code is in our target list
          // Note: TokenDef symbol might differ from ccxt code slightly, but usually matches for major ones.
          // Flexible matching could be added.

          if (targetSymbols.has(code) || code === 'JPY') {
            if (typeof amount === 'number' && amount > 0) {
              balances.push({
                symbol: code,
                amount: amount,
                sourceType: 'cex',
                sourceName: exchange.name || exchange.id,
                chain: 'cex'
              });
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch CEX balance for ${exchange.id}:`, e);
      }
    }

    return balances;
  }
}
