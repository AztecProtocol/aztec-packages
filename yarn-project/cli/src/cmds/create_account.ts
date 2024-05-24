import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { createCompatibleClient } from '../client.js';

export async function createAccount(
  rpcUrl: string,
  privateKey: Fr | undefined,
  wait: boolean,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const printPK = typeof privateKey === 'undefined';
  privateKey ??= Fr.random();

  const account = getSchnorrAccount(client, privateKey, deriveSigningKey(privateKey), Fr.ZERO);
  const { address, publicKeys, partialAddress } = account.getCompleteAddress();
  await account.register();
  const tx = account.deploy();
  const txHash = tx.getTxHash();
  debugLogger.debug(`Account contract tx sent with hash ${txHash}`);
  if (wait) {
    log(`\nWaiting for account contract deployment...`);
    await tx.wait();
  } else {
    log(`\nAccount deployment transaction hash: ${txHash}\n`);
  }

  log(`\nNew account:\n`);
  log(`Address:         ${address.toString()}`);
  log(`Public key:      ${publicKeys.toString()}`);
  if (printPK) {
    log(`Private key:     ${privateKey.toString()}`);
  }
  log(`Partial address: ${partialAddress.toString()}`);
}
