import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { AuthWitness } from '@aztec/aztec.js/authorization';
import { Contract, NO_WAIT, type SendInteractionOptions } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';

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

  const contract = Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(node, wallet, from);
  const sendOptions: SendInteractionOptions = {
    fee: { paymentMethod, gasSettings },
    from,
    authWitnesses,
  };

  const { estimatedGas, stats } = await call.simulate({
    ...sendOptions,
    fee: { ...sendOptions.fee, estimateGas: true },
  });

  if (feeOpts.estimateOnly) {
    return;
  }

  if (verbose) {
    printProfileResult(stats!, log);
  }

  if (wait) {
    try {
      const receipt = await call.send({
        ...sendOptions,
        fee: { ...sendOptions.fee, gasSettings: estimatedGas },
        wait: { timeout: DEFAULT_TX_TIMEOUT_S },
      });

      const txHash = receipt.txHash;
      log(`\nTransaction hash: ${txHash.toString()}`);
      log('Transaction has been mined');
      log(` Tx fee: ${receipt.transactionFee}`);
      log(` Status: ${receipt.status}`);
      log(` Block number: ${receipt.blockNumber}`);
      log(` Block hash: ${receipt.blockHash?.toString()}`);

      return {
        txHash,
      };
    } catch (err: any) {
      log(`Transaction failed\n ${err.message}`);
      throw err;
    }
  } else {
    const txHash = await call.send({
      ...sendOptions,
      fee: { ...sendOptions.fee, gasSettings: estimatedGas },
      wait: NO_WAIT,
    });
    log(`\nTransaction hash: ${txHash.toString()}`);
    log('Transaction pending. Check status with check-tx');
    return {
      txHash,
    };
  }
}
