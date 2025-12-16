import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { CommitteeAttestation } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { BlockHeader, Tx } from '@aztec/stdlib/tx';

import {
  type EpochProvingJobData,
  deserializeEpochProvingJobData,
  serializeEpochProvingJobData,
} from './epoch-proving-job-data.js';

describe('EpochProvingJobData', () => {
  it('serializes and deserializes', async () => {
    const txArray = times(8, () => Tx.random());
    const txs = new Map<string, Tx>(txArray.map(tx => [tx.getTxHash().toString(), tx]));

    const jobData: EpochProvingJobData = {
      epochNumber: EpochNumber.fromBigInt(3n),
      checkpoints: await timesAsync(4, i =>
        Checkpoint.random(CheckpointNumber(i + 1), { numBlocks: 1 + randomInt(5) }),
      ),
      txs,
      l1ToL2Messages: {
        [CheckpointNumber(0)]: [Fr.random(), Fr.random()],
        [CheckpointNumber(1)]: [Fr.random()],
        [CheckpointNumber(2)]: [Fr.random(), Fr.random(), Fr.random()],
        [CheckpointNumber(3)]: [Fr.random()],
      },
      previousBlockHeader: BlockHeader.random(),
      attestations: times(3, CommitteeAttestation.random),
    };

    const serialized = serializeEpochProvingJobData(jobData);
    const deserialized = deserializeEpochProvingJobData(serialized);
    expect(deserialized).toEqual(jobData);
  });
});
