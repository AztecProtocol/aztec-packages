import type { AztecAddress, Wallet } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';

export async function registerSender(wallet: Wallet, address: AztecAddress, log: LogFn) {
  await wallet.registerSender(address);
  log(`Sender registered: ${address}`);
}
