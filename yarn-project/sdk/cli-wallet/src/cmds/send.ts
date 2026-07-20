import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { AuthWitness } from '@aztec/aztec.js/authorization';
import { Contract, NO_WAIT, type SendInteractionOptions } from '@aztec/aztec.js/contracts';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { prepTx } from '@aztec/cli/utils';
import type { LogFn } from '@aztec/foundation/log';
import { TxStatus } from '@aztec/stdlib/tx';

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
  waitForStatus: TxStatus,
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

  const localStart = performance.now();
  const sim = await call.simulate({
    ...sendOptions,
    includeMetadata: true,
  });
  // includeMetadata: true guarantees these fields are present
  const estimatedGas = await wallet.estimateGasLimits(sim.gasUsed!);
  const stats = sim.stats!;

  if (feeOpts.estimateOnly) {
    return;
  }

  if (verbose) {
    printProfileResult(stats!, log);
  }

  const { txHash } = await call.send({
    ...sendOptions,
    fee: { ...sendOptions.fee, gasSettings: estimatedGas },
    wait: NO_WAIT,
  });
  const localTimeMs = performance.now() - localStart;

  log(`\nTransaction hash: ${txHash.toString()}`);

  if (wait) {
    try {
      const nodeStart = performance.now();
      const receipt = await waitForTx(node, txHash, { timeout: DEFAULT_TX_TIMEOUT_S, waitForStatus });
      const nodeTimeMs = performance.now() - nodeStart;

      const statusLabel = waitForStatus === TxStatus.PROPOSED ? 'proposed' : 'checkpointed';
      log(`Transaction has been ${statusLabel}`);
      log(` Tx fee: ${receipt.transactionFee}`);
      log(` Status: ${receipt.status}`);
      log(` Block number: ${receipt.blockNumber}`);
      log(` Block hash: ${receipt.blockHash?.toString()}`);
      log(` Local processing time: ${(localTimeMs / 1000).toFixed(1)}s`);
      log(` Node inclusion time: ${(nodeTimeMs / 1000).toFixed(1)}s`);

      return {
        txHash,
      };
    } catch (err: any) {
      log(`Transaction failed\n ${err.message}`);
      throw err;
    }
  } else {
    log('Transaction pending. Check status with check-tx');
    return {
      txHash,
    };
  }
}
