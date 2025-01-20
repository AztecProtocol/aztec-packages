import { jsonStringify } from '@aztec/foundation/json-rpc';

import { ContractClass2BlockL2Logs } from './l2_block_l2_logs.js';

function shouldBehaveLikeL2BlockL2Logs(L2BlockL2Logs: typeof ContractClass2BlockL2Logs) {
  describe(L2BlockL2Logs.name, () => {
    it('can encode L2Logs to buffer and back', async () => {
      const l2Logs = await L2BlockL2Logs.random(3, 1, 1);
      const buffer = l2Logs.toBuffer();
      const recovered = L2BlockL2Logs.fromBuffer(buffer);

      expect(recovered).toEqual(l2Logs);
    });

    it('getSerializedLength returns the correct length', async () => {
      const l2Logs = await L2BlockL2Logs.random(3, 1, 1);
      const buffer = l2Logs.toBuffer();
      const recovered = L2BlockL2Logs.fromBuffer(buffer);
      expect(recovered.getSerializedLength()).toEqual(buffer.length);
    });

    it('serializes to and from JSON via schema', () => {
      const l2Logs = L2BlockL2Logs.random(3, 1, 1);
      const json = jsonStringify(l2Logs);
      const recovered = L2BlockL2Logs.schema.parse(JSON.parse(json));
      expect(recovered).toEqual(l2Logs);
      expect(recovered).toBeInstanceOf(L2BlockL2Logs);
    });
  });
}

shouldBehaveLikeL2BlockL2Logs(ContractClass2BlockL2Logs);
