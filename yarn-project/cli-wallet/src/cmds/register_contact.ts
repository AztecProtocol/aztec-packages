import { type AccountWalletWithSecretKey, type AztecAddress } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';

export async function registerContact(wallet: AccountWalletWithSecretKey, address: AztecAddress, log: LogFn) {
  await wallet.registerContact(address);
  log(`Contact registered: ${address}`);
}
