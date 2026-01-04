import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { BalanceProvider } from './interface';
import { Balance, TokenDef } from '../../types';

export class SolanaProvider implements BalanceProvider {
  private connection: Connection;

  constructor(private walletAddresses: string[]) {
    // Determine RPC endpoint (Env var or public default)
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    console.log(`Solana RPC: ${process.env.SOLANA_RPC_URL ? 'Custom URL' : 'Public URL'}`);
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  private async withRetry<T>(operation: () => Promise<T>, wallet: string): Promise<T> {
    let retries = 0;
    const maxRetries = 5;
    let delay = 1000; // Start with 1 sec

    while (true) {
      try {
        return await operation();
      } catch (error: any) {
        // Check for rate limit (429) errors
        const isRateLimit = error.message && error.message.includes('429');

        if (isRateLimit) {
          if (retries >= maxRetries) throw error;

          console.warn(`Solana 429 Error (${wallet}). Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));

          retries++;
          delay *= 2; // Exponential backoff
        } else {
          throw error;
        }
      }
    }
  }

  async fetchBalances(tokens: TokenDef[]): Promise<Balance[]> {
    const balances: Balance[] = [];

    // Filter Solana wallets (Base58 check roughly)
    const solWallets = this.walletAddresses.filter(w => !w.startsWith('0x') && w.length > 30 && w.length < 50 && !w.startsWith('bc1'));

    if (solWallets.length === 0) return [];

    console.log(`Solanaウォレット ${solWallets.length} 件の残高を取得中...`);

    for (const wallet of solWallets) {
      try {
        // Initial rate limit mitigation
        await new Promise(resolve => setTimeout(resolve, 500));

        const pubKey = new PublicKey(wallet);

        // Native SOL
        const solToken = tokens.find(t => t.symbol === 'SOL');
        if (solToken) {
          const balance = await this.withRetry(() => this.connection.getBalance(pubKey), wallet);
          const floatAmount = balance / LAMPORTS_PER_SOL;
          if (floatAmount > 0) {
            balances.push({
              symbol: 'SOL',
              amount: floatAmount,
              sourceType: 'wallet',
              sourceName: wallet,
              chain: 'solana'
            });
          }
        }

        // SPL Tokens
        // Get all token accounts via Multi-call logic (getParsedTokenAccountsByOwner is one call)
        const tokenAccounts = await this.withRetry(() => this.connection.getParsedTokenAccountsByOwner(pubKey, {
          programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
        }), wallet);

        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const mintAddress = parsedInfo.mint;
          const tokenAmount = parsedInfo.tokenAmount.uiAmount;

          if (tokenAmount <= 0) continue;

          const matchingToken = tokens.find(t =>
            t.addresses && t.addresses['solana'] === mintAddress
          );

          if (matchingToken) {
            balances.push({
              symbol: matchingToken.symbol,
              amount: tokenAmount,
              sourceType: 'wallet',
              sourceName: wallet,
              chain: 'solana'
            });
          }
        }

      } catch (e) {
        // console.warn(`Failed to fetch Solana balances for ${wallet}:`, e);
        console.error(`Solana残高取得エラー (${wallet}):`, e);
      }
    }

    return balances;
  }
}
