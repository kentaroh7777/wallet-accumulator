import { Balance, TokenDef } from '../../types';

export interface BalanceProvider {
  fetchBalances(tokens: TokenDef[]): Promise<Balance[]>;
}
