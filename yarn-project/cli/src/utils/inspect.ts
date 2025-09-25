import type { LogFn } from '@aztec/foundation/log';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { TxHash } from '@aztec/stdlib/tx';

export async function inspectBlock(
  aztecNode: AztecNode,
  blockNumber: number,
  log: LogFn,
  opts: { showTxs?: boolean } = {},
) {
  const block = await aztecNode.getBlock(blockNumber);
  if (!block) {
    log(`No block found for block number ${blockNumber}`);
    return;
  }

  const blockHash = await block.hash();
  log(`Block ${blockNumber} (${blockHash.toString()})`);
  log(` Total fees: ${block.header.totalFees.toBigInt()}`);
  log(` Total mana used: ${block.header.totalManaUsed.toBigInt()}`);
  log(
    ` Fee per gas unit: DA=${block.header.globalVariables.gasFees.feePerDaGas} L2=${block.header.globalVariables.gasFees.feePerL2Gas}`,
  );
  log(` Coinbase: ${block.header.globalVariables.coinbase}`);
  log(` Fee recipient: ${block.header.globalVariables.feeRecipient}`);
  log(` Timestamp: ${new Date(Number(block.header.globalVariables.timestamp) * 500)}`);
  if (opts.showTxs) {
    log(``);
    for (const txHash of block.body.txEffects.map(tx => tx.txHash)) {
      await inspectTx(aztecNode, txHash, log, { includeBlockInfo: false });
    }
  } else {
    log(` Transactions: ${block.body.txEffects.length}`);
  }
}

export async function inspectTx(
  aztecNode: AztecNode,
  txHash: TxHash,
  log: LogFn,
  opts: { includeBlockInfo?: boolean } = {},
) {
  const [receipt, effectsInBlock] = await Promise.all([aztecNode.getTxReceipt(txHash), aztecNode.getTxEffect(txHash)]);
  // Base tx data
  log(`Tx ${txHash.toString()}`);
  log(` Status: ${receipt.status} ${effectsInBlock ? `(${effectsInBlock.data.revertCode.getDescription()})` : ''}`);
  if (receipt.error) {
    log(` Error: ${receipt.error}`);
  }

  if (!effectsInBlock) {
    return;
  }

  const effects = effectsInBlock.data;

  if (opts.includeBlockInfo) {
    log(` Block: ${receipt.blockNumber} (${receipt.blockHash?.toString()})`);
  }
  if (receipt.transactionFee) {
    log(` Fee: ${receipt.transactionFee.toString()}`);
  }

  // Public logs
  const publicLogs = effects.publicLogs;
  if (publicLogs.length > 0) {
    log(' Logs:');
    for (const publicLog of publicLogs) {
      log(`  ${publicLog.toHumanReadable()}`);
    }
  }

  // Public data writes
  const writes = effects.publicDataWrites;
  if (writes.length > 0) {
    log(' Public data writes:');
    for (const write of writes) {
      log(`  Leaf ${write.leafSlot.toString()} = ${write.value.toString()}`);
    }
  }

  // Created notes
  const notes = effects.noteHashes;
  if (notes.length > 0) {
    log(' Created notes:');
    log(`  Total: ${notes.length}`);
    for (const note of notes) {
      log(`  Note hash: ${note.toShortString()}`);
    }
  }

  // Created nullifiers
  const nullifiers = effects.nullifiers;
  if (nullifiers.length > 0) {
    log(' Created nullifiers:');
    for (const nullifier of nullifiers) {
      log(`  Nullifier: ${nullifier.toShortString()}`);
    }
  }

  // L2 to L1 messages
  if (effects.l2ToL1Msgs.length > 0) {
    log(` L2 to L1 messages:`);
    for (const msg of effects.l2ToL1Msgs) {
      log(`  ${msg.toString()}`);
    }
  }
}
