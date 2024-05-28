import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { createCompatibleClient } from '../client.js';
import { type IFeeOpts, printGasEstimates } from '../fees.js';

export async function createAccount(
  rpcUrl: string,
  privateKey: Fr | undefined,
  registerOnly: boolean,
  wait: boolean,
  feeOpts: IFeeOpts,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const printPK = typeof privateKey === 'undefined';
  privateKey ??= Fr.random();

  const account = getSchnorrAccount(client, privateKey, deriveSigningKey(privateKey), Fr.ZERO);
  const { address, publicKeys, partialAddress } = account.getCompleteAddress();
  await account.register();

  if (!registerOnly) {
    const wallet = await account.getWallet();
    const sendOpts = feeOpts.toSendOpts(wallet);
    if (feeOpts.estimateOnly) {
      const gas = await (await account.getDeployMethod()).estimateGas({ ...sendOpts });
      printGasEstimates(feeOpts, gas, log);
    } else {
      const tx = account.deploy({ ...sendOpts });
      const txHash = tx.getTxHash();
      debugLogger.debug(`Account contract tx sent with hash ${txHash}`);
      if (wait) {
        log(`\nWaiting for account contract deployment...`);
        await tx.wait();
      } else {
        log(`\nAccount deployment transaction hash: ${txHash}\n`);
      }
    }
  }

  log(`\nNew account:\n`);
  log(`Address:         ${address.toString()}`);
  log(`Public key:      ${publicKeys.toString()}`);
  if (printPK) {
    log(`Private key:     ${privateKey.toString()}`);
  }
  log(`Partial address: ${partialAddress.toString()}`);
}
