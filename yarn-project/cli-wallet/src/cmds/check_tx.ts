import type { AztecNode, PXE, TxHash } from '@aztec/aztec.js';
import { inspectTx } from '@aztec/cli/inspect';
import type { LogFn } from '@aztec/foundation/log';

export async function checkTx(client: PXE, aztecNode: AztecNode, txHash: TxHash, statusOnly: boolean, log: LogFn) {
  if (statusOnly) {
    const receipt = await client.getTxReceipt(txHash);
    return receipt.status;
  } else {
    await inspectTx(client, aztecNode, txHash, log, { includeBlockInfo: true });
  }
}
