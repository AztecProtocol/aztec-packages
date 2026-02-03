import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { LogFn } from '@aztec/foundation/log';

export async function registerSender(wallet: Wallet, address: AztecAddress, log: LogFn) {
  await wallet.registerSender(address);
  log(`Sender registered: ${address}`);
}
