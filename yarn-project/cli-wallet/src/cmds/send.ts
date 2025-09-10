import { AuthWitness, type AztecAddress, Contract, Fr, type SendMethodOptions, type Wallet } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { GasSettings } from '@aztec/stdlib/gas';

import { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { DEFAULT_TX_TIMEOUT_S } from '../utils/pxe_wrapper.js';

export async function send(
  wallet: Wallet,
  from: AztecAddress,
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  wait: boolean,
  cancellable: boolean,
  feeOpts: CLIFeeArgs,
  authWitnesses: AuthWitness[],
  verbose: boolean,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const txNonce = Fr.random();

  const userFeeOptions = await feeOpts.toUserFeeOptions(wallet, from);
  const sendOptions: SendMethodOptions = {
    fee: userFeeOptions,
    from,
    authWitnesses,
  };

  const gasLimits = await call.estimateGas(sendOptions);

  if (feeOpts.estimateOnly) {
    return;
  }

  const provenTx = await call.prove(sendOptions);
  if (verbose) {
    printProfileResult(provenTx.stats!, log);
  }

  const tx = provenTx.send();
  const txHash = await tx.getTxHash();
  log(`\nTransaction hash: ${txHash.toString()}`);
  if (wait) {
    try {
      await tx.wait({ timeout: DEFAULT_TX_TIMEOUT_S });

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
    ...provenTx.data.constants.txContext.gasSettings,
    ...gasLimits,
  });
  return {
    txHash,
    txNonce,
    cancellable,
    gasSettings,
  };
}
