import {
  type AccountWalletWithSecretKey,
  AuthWitness,
  type AztecAddress,
  Contract,
  Fr,
  type SendMethodOptions,
} from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { GasSettings } from '@aztec/stdlib/gas';

import { type IFeeOpts, printGasEstimates } from '../utils/options/fees.js';

export async function send(
  wallet: AccountWalletWithSecretKey,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  wait: boolean,
  cancellable: boolean,
  feeOpts: IFeeOpts,
  authWitnesses: AuthWitness[],
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const nonce = Fr.random();

  const sendOptions: SendMethodOptions = {
    ...(await feeOpts.toSendOpts(wallet)),
    authWitnesses,
    cancellable,
    nonce,
  };

  const gasLimits = await call.estimateGas(sendOptions);
  printGasEstimates(feeOpts, gasLimits, log);

  if (feeOpts.estimateOnly) {
    return;
  }

  const tx = call.send(sendOptions);
  const txHash = await tx.getTxHash();
  log(`\nTransaction hash: ${txHash.toString()}`);
  if (wait) {
    try {
      await tx.wait();

      log('Transaction has been mined');

      const receipt = await tx.getReceipt();
      log(` Tx fee: ${receipt.transactionFee}`);
      log(` Status: ${receipt.status}`);
      log(` Block number: ${receipt.blockNumber}`);
      log(` Block hash: ${receipt.blockHash?.toString()}`);
    } catch (err: any) {
      log(`Transaction failed\n ${err.message}`);
    }
  } else {
    log('Transaction pending. Check status with check-tx');
  }
  const gasSettings = GasSettings.from({
    ...feeOpts.gasSettings,
    ...gasLimits,
  });
  return {
    txHash,
    nonce,
    cancellable,
    gasSettings,
  };
}
