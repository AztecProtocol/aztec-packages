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
  const salt = Fr.ZERO;

  const account = getSchnorrAccount(client, privateKey, deriveSigningKey(privateKey), salt);
  const { address, publicKeys, partialAddress } = account.getCompleteAddress();

  let tx;
  let txReceipt;
  if (registerOnly) {
    await account.register();
  } else {
    const wallet = await account.getWallet();
    const sendOpts = feeOpts.toSendOpts(wallet);
    if (feeOpts.estimateOnly) {
      const gas = await (await account.getDeployMethod()).estimateGas({ ...sendOpts });
      printGasEstimates(feeOpts, gas, log);
    } else {
      tx = account.deploy({ ...sendOpts });
      const txHash = await tx.getTxHash();
      debugLogger.debug(`Account contract tx sent with hash ${txHash}`);
      if (wait) {
        log(`\nWaiting for account contract deployment...`);
        txReceipt = await tx.wait();
      }
    }
  }

  log(`\nNew account:\n`);
  log(`Address:         ${address.toString()}`);
  log(`Public key:      0x${publicKeys.toString()}`);
  if (printPK) {
    log(`Private key:     ${privateKey.toString()}`);
  }
  log(`Partial address: ${partialAddress.toString()}`);
  log(`Salt:            ${salt.toString()}`);
  log(`Init hash:       ${account.getInstance().initializationHash.toString()}`);
  log(`Deployer:        ${account.getInstance().deployer.toString()}`);
  if (tx) {
    log(`Deploy tx hash:  ${await tx.getTxHash()}`);
  }
  if (txReceipt) {
    log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
  }
}
