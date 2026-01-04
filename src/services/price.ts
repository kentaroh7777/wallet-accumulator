import axios from 'axios';
import { TokenDef } from '../types';

export class PriceService {
  private cache: Map<string, number> = new Map();

  constructor() {
    // Could load initial cache or static rates
    this.cache.set('JPY', 1);
  }

  async fetchPrices(tokens: TokenDef[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    prices.set('JPY', 1);

    // Filter tokens that need price fetching
    const targets = tokens.filter(t => t.coingeckoId);

    if (targets.length === 0) return prices;

    console.log(`Fetching prices for ${targets.length} tokens...`);

    // Coingecko supports multiple IDs in one call
    // ids=bitcoin,ethereum&vs_currencies=jpy
    const ids = targets.map(t => t.coingeckoId).join(',');

    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price`, {
        params: {
          ids: ids,
          vs_currencies: 'jpy'
        }
      });

      const data = response.data;

      for (const token of targets) {
        if (token.coingeckoId && data[token.coingeckoId]) {
          const price = data[token.coingeckoId].jpy;
          prices.set(token.symbol, price);
        } else {
          // Fallback or 0
          prices.set(token.symbol, 0);
        }
      }

    } catch (e) {
      console.error('Failed to fetch prices from Coingecko:', e);
      // Determine if we should fail hard or proceed with 0 prices?
      // Proceed with 0 for now.
    }

    return prices;
  }
}
