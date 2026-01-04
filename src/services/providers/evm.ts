import { createPublicClient, http, formatUnits, parseAbi, PublicClient } from 'viem';
import { mainnet, bsc, polygon, astar, base, arbitrum, optimism } from 'viem/chains';
import { BalanceProvider } from './interface';
import { Balance, TokenDef } from '../../types';

const chains = {
  ethereum: mainnet,
  bsc: bsc,
  polygon: polygon,
  astar: astar,
  base: base,
  arbitrum: arbitrum,
  optimism: optimism,
};

// ERC20 min ABI
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

export class EvmProvider implements BalanceProvider {
  // Using any to bypass strict type checks between viem versions/chains
  private clients: Record<string, any>;
  private tokenDecimalsCache: Map<string, number>;

  constructor(private walletAddresses: string[]) {
    this.clients = {};
    this.tokenDecimalsCache = new Map();
    for (const [key, chain] of Object.entries(chains)) {
      this.clients[key] = createPublicClient({
        chain: chain,
        transport: http(),
      });
    }
  }

  private async getErc20Decimals(chainName: string, tokenAddress: string): Promise<number | null> {
    const cacheKey = `${chainName}:${tokenAddress.toLowerCase()}`;
    const cached = this.tokenDecimalsCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const client = this.clients[chainName];
    if (!client) return null;

    try {
      const decimals = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      });

      // viemはuint8をnumberで返す想定
      if (typeof decimals === 'number' && Number.isFinite(decimals)) {
        this.tokenDecimalsCache.set(cacheKey, decimals);
        return decimals;
      }
      return null;
    } catch {
      return null;
    }
  }

  async fetchBalances(tokens: TokenDef[]): Promise<Balance[]> {
    const balances: Balance[] = [];
    const debugEnabled = process.env.WA_DEBUG === '1';

    // Filter EVM wallets (0x...)
    const evmWallets = this.walletAddresses.filter(w => w.startsWith('0x'));
    if (evmWallets.length === 0) return [];

    console.log(`EVMウォレット ${evmWallets.length} 件の残高を取得中...`);

    for (const token of tokens) {
      // If native token, it might not have "addresses" map but just "chains"
      const targetChains: string[] = [];
      if (token.native && token.chains) {
        for (const [chainName, type] of Object.entries(token.chains)) {
          if (type === 'native' && this.clients[chainName]) {
            targetChains.push(chainName);
          }
        }
      }

      // Check configured addresses also
      if (token.addresses) {
        for (const chainName of Object.keys(token.addresses)) {
          if (this.clients[chainName] && !targetChains.includes(chainName)) {
            targetChains.push(chainName);
          }
        }
      }

      for (const chainName of targetChains) {
        const client = this.clients[chainName];
        const tokenAddress = token.addresses ? token.addresses[chainName] : null;
        const isNative = (token.native && token.chains && token.chains[chainName] === 'native');

        if (!tokenAddress && !isNative) continue;

        for (const wallet of evmWallets) {
          // Rate limit mitigation: 200ms
          await new Promise(resolve => setTimeout(resolve, 200));

          try {
            let amount = 0n;
            let decimals = token.decimals || 18;

            if (isNative) {
              amount = await client.getBalance({ address: wallet as `0x${string}` });
            } else if (tokenAddress) {
              // ERC20
              amount = await client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [wallet as `0x${string}`],
              });

              // decimalsはトークン定義より、コントラクトのdecimals()を優先する（チェーン差分対策）
              const contractDecimals = await this.getErc20Decimals(chainName, tokenAddress);
              if (contractDecimals !== null) {
                decimals = contractDecimals;
                if (debugEnabled) {
                  console.log(`[DEBUG] ERC20 decimals: ${token.symbol} ${chainName} ${tokenAddress} => ${decimals}`);
                }
              } else {
                if (debugEnabled) {
                  console.log(`[DEBUG] ERC20 decimals取得失敗: ${token.symbol} ${chainName} ${tokenAddress}（fallback=${decimals}）`);
                }
              }
            }

            const floatAmount = parseFloat(formatUnits(amount, decimals));

            if (floatAmount > 0) {
              balances.push({
                symbol: token.symbol,
                amount: floatAmount,
                sourceType: 'wallet',
                sourceName: wallet,
                chain: chainName
              });
            }
          } catch (e) {
            // console.warn(`Failed to fetch ${token.symbol} on ${chainName} for ${wallet}:`, e);
          }
        }
      }
    }

    return balances;
  }
}
