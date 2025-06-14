import { jsonStringify } from '@aztec/foundation/json-rpc';

import { L2Block } from './l2_block.js';
import { CommitteeAttestation } from './proposal/committee_attestation.js';
import { PublishedL2Block } from './published_l2_block.js';

describe('PublishedL2Block', () => {
  it('convert to and from json', async () => {
    const block = {
      block: await L2Block.random(1),
      attestations: [CommitteeAttestation.random()],
      l1: { blockHash: `0x`, blockNumber: 1n, timestamp: 0n },
    };
    const parsed = PublishedL2Block.schema.parse(JSON.parse(jsonStringify(block)));
    expect(parsed).toEqual(block);
  });
});
