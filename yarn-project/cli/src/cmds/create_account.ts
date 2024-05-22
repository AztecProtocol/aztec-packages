import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { Fq, Fr } from '@aztec/foundation/fields';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { createCompatibleClient } from '../client.js';

export async function createAccount(
  rpcUrl: string,
  encryptionPrivateKey: Fr,
  signingPrivateKey: Fq,
  wait: boolean,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const actualEncryptionPrivateKey = encryptionPrivateKey ?? Fr.random();
  const actualSigningPrivateKey = signingPrivateKey ?? Fq.random();

  const account = getSchnorrAccount(client, actualEncryptionPrivateKey, actualSigningPrivateKey, Fr.ZERO);
  const { address, publicKeys, partialAddress } = account.getCompleteAddress();
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
  if (!signingPrivateKey) {
    log(`Private key:     ${actualSigningPrivateKey.toString()}`);
  }
  log(`Partial address: ${partialAddress.toString()}`);
}
