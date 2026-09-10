import { ContractBase, type SendInteractionOptions } from '@aztec/aztec.js/contracts';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas } from '@aztec/stdlib/gas';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import type { BotConfig } from './config.js';

/**
 * Gets the private and public balance of the given token for the given address.
 * @param token - Token contract.
 * @param who - Address to get the balance for.
 * @returns - Private and public token balances as bigints.
 */
export async function getBalances(
  token: TokenContract,
  who: AztecAddress,
  from?: AztecAddress,
): Promise<{ privateBalance: bigint; publicBalance: bigint }> {
  const { result: privateBalance } = await token.methods.balance_of_private(who).simulate({ from: from ?? who });
  const { result: publicBalance } = await token.methods.balance_of_public(who).simulate({ from: from ?? who });
  return { privateBalance, publicBalance };
}

export async function getPrivateBalance(
  token: PrivateTokenContract,
  who: AztecAddress,
  from?: AztecAddress,
): Promise<bigint> {
  const { result: privateBalance } = await token.methods.get_balance(who).simulate({ from: from ?? who });
  return privateBalance;
}

export function isStandardTokenContract(token: ContractBase): token is TokenContract {
  return 'mint_to_public' in token.methods;
}

export function isAMMContract(contract: ContractBase): contract is AMMContract {
  return 'add_liquidity' in contract.methods;
}

/**
 * Builds the send options every bot uses for its transactions: the sender account, and explicit gas limits when
 * the operator configured them. Also applies the configured fee padding to the wallet.
 */
export function getSendInteractionOptions(
  wallet: EmbeddedWallet,
  config: BotConfig,
  from: AztecAddress,
): SendInteractionOptions {
  const { l2GasLimit, daGasLimit, minFeePadding } = config;

  wallet.setMinFeePadding(minFeePadding);

  const gasSettings =
    l2GasLimit !== undefined && l2GasLimit > 0 && daGasLimit !== undefined && daGasLimit > 0
      ? { gasLimits: Gas.from({ l2Gas: l2GasLimit, daGas: daGasLimit }) }
      : undefined;

  return { from, ...(gasSettings ? { fee: { gasSettings } } : {}) };
}
