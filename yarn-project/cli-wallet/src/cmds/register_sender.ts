import { type AccountWalletWithSecretKey, type AztecAddress } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';

export async function registerSender(wallet: AccountWalletWithSecretKey, address: AztecAddress, log: LogFn) {
  await wallet.registerSender(address);
  log(`Sender registered: ${address}`);
}
