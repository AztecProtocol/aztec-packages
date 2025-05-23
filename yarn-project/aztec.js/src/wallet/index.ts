import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PXE } from '@aztec/stdlib/interfaces/client';

import type { AccountContract } from '../account/account_contract.js';
import { AccountWallet } from './account_wallet.js';

export * from './wallet.js';
export * from './account_wallet.js';
export * from './account_wallet_with_private_key.js';
export * from './signerless_wallet.js';

/**
 * Gets a wallet for an already registered account.
 * @param pxe - PXE Service instance.
 * @param address - Address for the account.
 * @param accountContract - Account contract implementation.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export async function getWallet(
  pxe: PXE,
  address: AztecAddress,
  accountContract: AccountContract,
): Promise<AccountWallet> {
  const completeAddress = (await pxe.getRegisteredAccounts()).find(completeAddress =>
    completeAddress.address.equals(address),
  );
  if (!completeAddress) {
    throw new Error(`Account ${address} not found`);
  }
  const nodeInfo = await pxe.getNodeInfo();
  const entrypoint = accountContract.getInterface(completeAddress, nodeInfo);
  return new AccountWallet(pxe, entrypoint);
}
