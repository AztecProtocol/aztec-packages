import { type AccountWalletWithSecretKey, AuthWitness, type AztecAddress, Contract } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';

export async function addAuthwit(
  wallet: AccountWalletWithSecretKey,
  authwit: AuthWitness,
  authorizer: AztecAddress,
  log: LogFn,
) {
  await wallet.addAuthWitness(authwit);

  log(`Added authorization witness from ${authorizer}`);
}
