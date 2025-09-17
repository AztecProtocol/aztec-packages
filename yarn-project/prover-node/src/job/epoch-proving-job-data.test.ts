import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import { Tx } from '@aztec/stdlib/tx';

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
      epochNumber: 3n,
      blocks: await timesAsync(4, i => L2Block.random(i + 1)),
      txs,
      l1ToL2Messages: {
        0: [Fr.random(), Fr.random()],
        1: [Fr.random()],
        2: [Fr.random(), Fr.random(), Fr.random()],
        3: [Fr.random()],
      },
      previousBlockHeader: await L2Block.random(0).then(b => b.getBlockHeader()),
      attestations: times(3, CommitteeAttestation.random),
    };

    const serialized = serializeEpochProvingJobData(jobData);
    const deserialized = deserializeEpochProvingJobData(serialized);
    expect(deserialized).toEqual(jobData);
  });
});
