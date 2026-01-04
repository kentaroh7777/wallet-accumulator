export type ChainType = 'evm' | 'solana' | 'bitcoin' | 'cex';

export interface TokenDef {
  symbol: string;
  coingeckoId?: string;
  decimals?: number;
  // Chain specific addresses
  addresses?: {
    [chain: string]: string; // e.g. "ethereum": "0x...", "solana": "..."
  };
  // Native token configuration
  chains?: {
    [chain: string]: 'native';
  };
  native?: boolean;
}

export interface TokenConfig {
  tokens: TokenDef[];
}

export interface Balance {
  symbol: string;
  amount: number;
  sourceType: 'wallet' | 'cex';
  sourceName: string; // Wallet address or Exchange name
  chain?: string;
}

export interface AggregatedBalance {
  symbol: string;
  totalAmount: number;
  details: Balance[];
  priceJpy: number;
  valueJpy: number;
}
