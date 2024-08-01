import { type AztecAddress, Contract, type Fr } from '@aztec/aztec.js';
import { createCompatibleClient } from '@aztec/aztec.js';
import { prepTx } from '@aztec/cli/utils';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { type IFeeOpts, printGasEstimates } from '../fees.js';
import { retrieveWallet } from '../utils/accounts.js';

export async function send(
  functionName: string,
  functionArgsIn: any[],
  contractArtifactPath: string,
  contractAddress: AztecAddress,
  aliasOrAddress: string,
  rpcUrl: string,
  wait: boolean,
  feeOpts: IFeeOpts,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const { functionArgs, contractArtifact } = await prepTx(contractArtifactPath, functionName, functionArgsIn, log);

  const client = await createCompatibleClient(rpcUrl, debugLogger);

  const wallet = await retrieveWallet(client, aliasOrAddress);

  const contract = await Contract.at(contractAddress, contractArtifact, wallet);
  const call = contract.methods[functionName](...functionArgs);

  if (feeOpts.estimateOnly) {
    const gas = await call.estimateGas({ ...feeOpts.toSendOpts(wallet) });
    printGasEstimates(feeOpts, gas, log);
    return;
  }

  const tx = call.send({ ...feeOpts.toSendOpts(wallet) });
  log(`\nTransaction hash: ${(await tx.getTxHash()).toString()}`);
  if (wait) {
    await tx.wait();

    log('Transaction has been mined');

    const receipt = await tx.getReceipt();
    log(` Tx fee: ${receipt.transactionFee}`);
    log(` Status: ${receipt.status}`);
    log(` Block number: ${receipt.blockNumber}`);
    log(` Block hash: ${receipt.blockHash?.toString('hex')}`);
  } else {
    log('Transaction pending. Check status with get-tx-receipt');
  }
}
