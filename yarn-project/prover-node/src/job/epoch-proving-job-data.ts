import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { InboxMessageBundle } from '@aztec/stdlib/messaging';
import { BlockHeader, Tx } from '@aztec/stdlib/tx';

/** All data from an epoch used in proving. */
export type EpochProvingJobData = {
  epochNumber: EpochNumber;
  checkpoints: Checkpoint[];
  txs: Map<string, Tx>;
  l1ToL2Messages: Record<CheckpointNumber, InboxMessageBundle>;
  previousBlockHeader: BlockHeader;
  /** Inbox rolling hash of the checkpoint before the epoch's first checkpoint (its chain start); genesis is zero. */
  previousInboxRollingHash: Fr;
  attestations: CommitteeAttestation[];
};

export function validateEpochProvingJobData(data: EpochProvingJobData) {
  if (data.checkpoints.length === 0) {
    throw new Error('No checkpoints to prove');
  }

  const firstBlockNumber = data.checkpoints[0].blocks[0].number;
  const previousBlockNumber = data.previousBlockHeader.getBlockNumber();
  if (previousBlockNumber + 1 !== firstBlockNumber) {
    throw new Error(
      `Initial block number ${firstBlockNumber} does not match previous block header ${previousBlockNumber}`,
    );
  }

  for (const checkpoint of data.checkpoints) {
    if (!(checkpoint.number in data.l1ToL2Messages)) {
      throw new Error(`Missing L1 to L2 messages for checkpoint number ${checkpoint.number}`);
    }
  }
}

export function serializeEpochProvingJobData(data: EpochProvingJobData): Buffer {
  const checkpoints = data.checkpoints.map(checkpoint => checkpoint.toBuffer());
  const txs = Array.from(data.txs.values()).map(tx => tx.toBuffer());
  // Each checkpoint's bundle is written as a bucket count followed by, per bucket, its timestamp and a
  // length-prefixed vector of leaves.
  const l1ToL2Messages = Object.entries(data.l1ToL2Messages).map(([checkpointNumber, bundle]) => [
    Number(checkpointNumber),
    bundle.length,
    ...bundle.map(bucket => [bigintToUInt64BE(bucket.timestamp), bucket.leaves.length, ...bucket.leaves]),
  ]);
  const attestations = data.attestations.map(attestation => attestation.toBuffer());

  return serializeToBuffer(
    data.epochNumber,
    data.previousBlockHeader,
    data.previousInboxRollingHash,
    checkpoints.length,
    ...checkpoints,
    txs.length,
    ...txs,
    l1ToL2Messages.length,
    ...l1ToL2Messages,
    attestations.length,
    ...attestations,
  );
}

export function deserializeEpochProvingJobData(buf: Buffer): EpochProvingJobData {
  const reader = BufferReader.asReader(buf);
  const epochNumber = EpochNumber(reader.readNumber());
  const previousBlockHeader = reader.readObject(BlockHeader);
  const previousInboxRollingHash = Fr.fromBuffer(reader);
  const checkpoints = reader.readVector(Checkpoint);
  const txArray = reader.readVector(Tx);

  const l1ToL2MessageCheckpointCount = reader.readNumber();
  const l1ToL2Messages: Record<number, InboxMessageBundle> = {};
  for (let i = 0; i < l1ToL2MessageCheckpointCount; i++) {
    const checkpointNumber = CheckpointNumber(reader.readNumber());
    const bucketCount = reader.readNumber();
    l1ToL2Messages[checkpointNumber] = Array.from({ length: bucketCount }, () => ({
      timestamp: reader.readUInt64(),
      leaves: reader.readVector(Fr),
    }));
  }

  const attestations = reader.readVector(CommitteeAttestation);

  const txs = new Map<string, Tx>(txArray.map(tx => [tx.getTxHash().toString(), tx]));

  return {
    epochNumber,
    previousBlockHeader,
    previousInboxRollingHash,
    checkpoints,
    txs,
    l1ToL2Messages,
    attestations,
  };
}
