import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { L2Block } from '@aztec/stdlib/block';
import { BlockHeader, Tx } from '@aztec/stdlib/tx';

/** All data from an epoch used in proving. */
export type EpochProvingJobData = {
  epochNumber: bigint;
  blocks: L2Block[];
  txs: Tx[];
  l1ToL2Messages: Record<number, Fr[]>;
  previousBlockHeader: BlockHeader;
};

export function validateEpochProvingJobData(data: EpochProvingJobData) {
  if (data.blocks.length > 0 && data.previousBlockHeader.getBlockNumber() + 1 !== data.blocks[0].number) {
    throw new Error(
      `Initial block number ${
        data.blocks[0].number
      } does not match previous block header ${data.previousBlockHeader.getBlockNumber()}`,
    );
  }

  for (const blockNumber of data.blocks.map(block => block.number)) {
    if (!(blockNumber in data.l1ToL2Messages)) {
      throw new Error(`Missing L1 to L2 messages for block number ${blockNumber}`);
    }
  }
}

export function serializeEpochProvingJobData(data: EpochProvingJobData): Buffer {
  const blocks = data.blocks.map(block => block.toBuffer());
  const txs = data.txs.map(tx => tx.toBuffer());
  const l1ToL2Messages = Object.entries(data.l1ToL2Messages).map(([blockNumber, messages]) => [
    Number(blockNumber),
    messages.length,
    ...messages,
  ]);

  return serializeToBuffer(
    Number(data.epochNumber),
    data.previousBlockHeader,
    blocks.length,
    ...blocks,
    txs.length,
    ...txs,
    l1ToL2Messages.length,
    ...l1ToL2Messages,
  );
}

export function deserializeEpochProvingJobData(buf: Buffer): EpochProvingJobData {
  const reader = BufferReader.asReader(buf);
  const epochNumber = BigInt(reader.readNumber());
  const previousBlockHeader = reader.readObject(BlockHeader);
  const blocks = reader.readVector(L2Block);
  const txs = reader.readVector(Tx);

  const l1ToL2MessageBlockCount = reader.readNumber();
  const l1ToL2Messages: Record<number, Fr[]> = {};
  for (let i = 0; i < l1ToL2MessageBlockCount; i++) {
    const blockNumber = reader.readNumber();
    const messages = reader.readVector(Fr);
    l1ToL2Messages[blockNumber] = messages;
  }

  return { epochNumber, previousBlockHeader, blocks, txs, l1ToL2Messages };
}
