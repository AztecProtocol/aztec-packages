import type { ContractBase } from '@aztec/aztec.js';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { EasyPrivateTokenContract } from '@aztec/noir-contracts.js/EasyPrivateToken';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Gets the private and public balance of the given token for the given address.
 * @param token - Token contract.
 * @param who - Address to get the balance for.
 * @returns - Private and public token balances as bigints.
 */
export async function getBalances(
  token: TokenContract,
  who: AztecAddress,
): Promise<{ privateBalance: bigint; publicBalance: bigint }> {
  const privateBalance = await token.methods.balance_of_private(who).simulate();
  const publicBalance = await token.methods.balance_of_public(who).simulate();
  return { privateBalance, publicBalance };
}

export async function getPrivateBalance(token: EasyPrivateTokenContract, who: AztecAddress): Promise<bigint> {
  const privateBalance = await token.methods.get_balance(who).simulate();
  return privateBalance;
}

export function isStandardTokenContract(token: ContractBase): token is TokenContract {
  return 'mint_to_public' in token.methods;
}

export function isAMMContract(contract: ContractBase): contract is AMMContract {
  return 'add_liquidity' in contract.methods;
}
