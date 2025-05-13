import { times, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { L2Block } from '@aztec/stdlib/block';
import { Tx } from '@aztec/stdlib/tx';

import {
  type EpochProvingJobData,
  deserializeEpochProvingJobData,
  serializeEpochProvingJobData,
} from './epoch-proving-job-data.js';

describe('EpochProvingJobData', () => {
  it('serializes and deserializes', async () => {
    const jobData: EpochProvingJobData = {
      epochNumber: 3n,
      blocks: await timesAsync(4, i => L2Block.random(i + 1)),
      txs: times(8, () => Tx.random()),
      l1ToL2Messages: {
        0: [Fr.random(), Fr.random()],
        1: [Fr.random()],
        2: [Fr.random(), Fr.random(), Fr.random()],
        3: [Fr.random()],
      },
      previousBlockHeader: await L2Block.random(0).then(b => b.header),
    };

    const serialized = serializeEpochProvingJobData(jobData);
    expect(deserializeEpochProvingJobData(serialized)).toEqual(jobData);
  });
});
