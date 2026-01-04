import axios from 'axios';
import { BalanceProvider } from './interface';
import { Balance, TokenDef } from '../../types';

export class BitcoinProvider implements BalanceProvider {
  constructor(private walletAddresses: string[]) { }

  async fetchBalances(tokens: TokenDef[]): Promise<Balance[]> {
    const balances: Balance[] = [];

    // Filter Bitcoin wallets
    // Starts with 1, 3, or bc1
    const btcWallets = this.walletAddresses.filter(w => w.startsWith('1') || w.startsWith('3') || w.startsWith('bc1'));
    if (btcWallets.length === 0) return [];

    const btcToken = tokens.find(t => t.symbol === 'BTC');
    if (!btcToken) return [];

    console.log(`Fetching Bitcoin balances for ${btcWallets.length} wallets...`);

    for (const wallet of btcWallets) {
      try {
        // Use mempool.space API
        const response = await axios.get(`https://mempool.space/api/address/${wallet}`);
        const stats = response.data.chain_stats;
        const funded = stats.funded_txo_sum;
        const spent = stats.spent_txo_sum;
        const satoshis = funded - spent;

        // Also check mempool unconfirmed? Typically confirmed is safer.

        const floatAmount = satoshis / 100_000_000; // 8 decimals

        if (floatAmount > 0) {
          balances.push({
            symbol: 'BTC',
            amount: floatAmount,
            sourceType: 'wallet',
            sourceName: wallet,
            chain: 'bitcoin'
          });
        }
      } catch (e) {
        console.warn(`Failed to fetch Bitcoin balance for ${wallet}:`, e);
      }

      // Basic rate limit wait
      await new Promise(r => setTimeout(r, 200));
    }

    return balances;
  }
}
