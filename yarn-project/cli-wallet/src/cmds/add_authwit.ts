import type { AccountWalletWithSecretKey, AuthWitness, AztecAddress } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';

export async function addAuthwit(
  wallet: AccountWalletWithSecretKey,
  authwit: AuthWitness,
  authorizer: AztecAddress,
  log: LogFn,
) {
  //await wallet.addAuthWitness(authwit);
  throw new Error('Not implemented');

  log(`Added authorization witness from ${authorizer}`);
}
