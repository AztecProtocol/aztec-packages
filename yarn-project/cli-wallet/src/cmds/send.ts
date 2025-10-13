import {
  AuthWitness,
  type AztecAddress,
  type AztecNode,
  Contract,
  Fr,
  type SendInteractionOptions,
} from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { GasSettings } from '@aztec/stdlib/gas';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import type { CLIWallet } from '../utils/wallet.js';

export async function send(
  wallet: CLIWallet,
  node: AztecNode,
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

  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, from);
  const sendOptions: SendInteractionOptions = {
    fee: { paymentMethod, gasSettings },
    from,
    authWitnesses,
  };

  const { estimatedGas } = await call.simulate({
    ...sendOptions,
    fee: { ...sendOptions.fee, estimateGas: true },
  });

  if (feeOpts.estimateOnly) {
    return;
  }

  const provenTx = await call.prove({ ...sendOptions, fee: { ...sendOptions.fee, gasSettings: estimatedGas } });
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
  const finalGasSettings = GasSettings.from({
    ...provenTx.data.constants.txContext.gasSettings,
    ...estimatedGas,
  });
  return {
    txHash,
    txNonce,
    cancellable,
    gasSettings: finalGasSettings,
  };
}
